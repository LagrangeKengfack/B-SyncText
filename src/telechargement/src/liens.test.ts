import { describe, expect, it, vi } from 'vitest';
import { nouvelId } from '@b-synctext/commun';
import { depotMemoire, lienDeTest } from './memoire.test-util.js';
import { type Ports, traiterDemande, traiterFichier, traiterLien } from './liens.js';
import { CacheEpuises } from './regles.js';

const ID = 'L'.repeat(22);

function ports(n: number, horloge = { t: 1_000_000 }) {
  const mem = depotMemoire([lienDeTest(n)]);
  const courriels: string[] = [];
  const p: Ports = {
    depot: mem.depot,
    cache: new CacheEpuises(),
    maintenant: () => horloge.t,
    nouvelId,
    produirePdf: async (_l, k) => new TextEncoder().encode(`pdf ${k}`),
    envoyerCourriel: async (l) => { courriels.push(l.creePar); },
    journal: () => {},
  };
  return { p, mem, courriels, horloge };
}

const corps = (r: { body: string }) => JSON.parse(r.body);

describe('C-1 : exactement N exemplaires', () => {
  it('1 000 demandes simultanées sur N = 10 : 10 prêts, numérotés 1 à 10, un seul e-mail', async () => {
    const { p, courriels, mem } = ports(10);
    const reponses = await Promise.all(Array.from({ length: 1000 }, () => traiterDemande(p, ID)));
    const prets = reponses.map(corps).filter((c) => c.etat === 'pret');
    expect(prets).toHaveLength(10);
    expect(reponses.map(corps).every((c) => c.etat === 'pret' || c.etat === 'patientez')).toBe(true);

    const fichiers = await Promise.all(prets.flatMap((c) => [traiterFichier(p, ID, c.ticket), traiterFichier(p, ID, c.ticket)]));
    const ok = fichiers.filter((f) => f.statusCode === 200);
    expect(ok).toHaveLength(10);
    expect(fichiers.filter((f) => f.statusCode === 410)).toHaveLength(10);
    const numeros = ok.map((f) => Number(Buffer.from(f.body, 'base64').toString().split(' ')[1])).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ok[0]!.headers['content-disposition']).toMatch(/^attachment; filename="Mon-document-exemplaire-\d+\.pdf"$/);
    expect(courriels).toEqual(['auteur@exemple.fr']);
    expect(mem.tableLiens.get(ID)!.etat).toBe('epuise');

    // C-6 : réponse immédiate depuis le cache, sans lire la base.
    const lire = vi.spyOn(p.depot, 'lireLien');
    expect(corps(await traiterDemande(p, ID))).toEqual({ etat: 'epuise', n: 10 });
    expect(corps(await traiterLien(p, ID))).toMatchObject({ etat: 'epuise', restants: 0 });
    expect(lire).not.toHaveBeenCalled();
  });

  it('réservation expirée : remise en stock, ticket expiré refusé', async () => {
    const { p, mem, horloge } = ports(1);
    const premier = corps(await traiterDemande(p, ID));
    expect(premier).toMatchObject({ etat: 'pret', restants: 0, n: 1 });
    expect(corps(await traiterDemande(p, ID))).toEqual({ etat: 'patientez', reessayerDans: 2, restants: 0, n: 1 });
    horloge.t += 60_000;
    const second = corps(await traiterDemande(p, ID));
    expect(second.etat).toBe('pret');
    expect((await traiterFichier(p, ID, premier.ticket)).statusCode).toBe(410);
    expect((await traiterFichier(p, ID, second.ticket)).statusCode).toBe(200);
    expect(mem.tableLiens.get(ID)).toMatchObject({ comptes: 1, disponibles: 0, etat: 'epuise' });
  });

  it('lien épuisé sans clôture (panne) : la demande le clôt', async () => {
    const { p, mem, courriels } = ports(1);
    Object.assign(mem.tableLiens.get(ID)!, { disponibles: 0, comptes: 1, numerotation: 1 });
    expect(corps(await traiterDemande(p, ID))).toEqual({ etat: 'epuise', n: 1 });
    expect(mem.tableLiens.get(ID)!.etat).toBe('epuise');
    expect(courriels).toHaveLength(1);
  });
});

describe('réponses', () => {
  it('lien inconnu ou mal formé : 404', async () => {
    const { p } = ports(1);
    expect((await traiterDemande(p, 'X'.repeat(22))).statusCode).toBe(404);
    expect((await traiterDemande(p, 'court')).statusCode).toBe(404);
    expect((await traiterLien(p, 'X'.repeat(22))).statusCode).toBe(404);
    expect((await traiterFichier(p, 'court', 'x')).statusCode).toBe(404);
  });

  it('GET lien : titre, n, restants, etat', async () => {
    const { p } = ports(3);
    expect(corps(await traiterLien(p, ID))).toEqual({ titre: 'Mon document', n: 3, restants: 3, etat: 'actif' });
  });

  it('fichier sans ticket : 400 ; ticket inconnu : 410', async () => {
    const { p } = ports(1);
    expect((await traiterFichier(p, ID, undefined)).statusCode).toBe(400);
    expect((await traiterFichier(p, ID, 'T'.repeat(22))).statusCode).toBe(410);
  });

  it('débit DynamoDB dépassé : patientez (demandes), 429 (fichier, lien)', async () => {
    const { p } = ports(1);
    const debit = Object.assign(new Error('lent'), { name: 'ProvisionedThroughputExceededException' });
    p.depot.lireLien = async () => { throw debit; };
    expect(corps(await traiterDemande(p, ID))).toMatchObject({ etat: 'patientez', reessayerDans: 2 });
    expect((await traiterLien(p, ID)).statusCode).toBe(429);
    p.depot.compter = async () => { throw Object.assign(new Error(), { name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'None' }, { Code: 'TransactionConflict' }] }); };
    expect((await traiterFichier(p, ID, 'T'.repeat(22))).statusCode).toBe(429);
  });

  it("échec d'écriture de la réservation par débit : exemplaire rendu, patientez", async () => {
    const { p, mem } = ports(1);
    p.depot.creerReservation = async () => { throw Object.assign(new Error(), { name: 'ThrottlingException' }); };
    expect(corps(await traiterDemande(p, ID)).etat).toBe('patientez');
    expect(mem.tableLiens.get(ID)!.disponibles).toBe(1);
  });

  it("erreur d'envoi d'e-mail : journalisée, le PDF part quand même", async () => {
    const { p } = ports(1);
    p.envoyerCourriel = async () => { throw new Error('SES'); };
    const journal = vi.fn();
    p.journal = journal;
    const c = corps(await traiterDemande(p, ID));
    expect((await traiterFichier(p, ID, c.ticket)).statusCode).toBe(200);
    expect(journal).toHaveBeenCalledOnce();
  });

  it('autre erreur : propagée (500 dans le handler)', async () => {
    const { p } = ports(1);
    p.depot.lireLien = async () => { throw new Error('inattendue'); };
    await expect(traiterDemande(p, ID)).rejects.toThrow('inattendue');
  });
});

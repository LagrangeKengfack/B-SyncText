import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { jourWat, TAILLE_MAX_DOCUMENT } from '@b-synctext/commun';
import { controlerMiseAJour } from './controle.js';
import { fauxDeps } from './faux-aws.js';
import { docInitial, majDe, texte, zoneTexte } from './outils-test.js';
import { compacter, reconstruire } from './persistance.js';
import { SuiviDocument } from './suivi.js';

/** Serveur simulé : contrôle puis application, comme beforeSync puis readUpdate. */
function serveurSimule() {
  const env = fauxDeps();
  const ydoc = new Y.Doc();
  const suivi = new SuiviDocument(env.horloge.ms);
  ydoc.on('update', () => suivi.invaliderLongueur());
  async function recevoir(maj: Uint8Array, email: string, bloqueJusqua?: number) {
    const r = await controlerMiseAJour(env.deps, { docId: 'doc1', ydoc, maj, email, suivi, bloqueJusqua });
    if (r.decision === 'acceptee') {
      Y.applyUpdate(ydoc, maj);
      suivi.finEcriture(r.seq);
    }
    return r;
  }
  return { ...env, ydoc, suivi, recevoir };
}

function client(depuis: Y.Doc): Y.Doc {
  const c = new Y.Doc();
  Y.applyUpdate(c, Y.encodeStateAsUpdate(depuis));
  return c;
}

describe('contrôle avant application', () => {
  it('accepte, débite et journalise avant d’appliquer (C-2, C-4)', async () => {
    const s = serveurSimule();
    const init = docInitial();
    await s.recevoir(Y.encodeStateAsUpdate(init), 'a@x.fr');
    const a = client(s.ydoc);
    const maj = majDe(a, () => zoneTexte(a).insert(0, 'bonjour'));
    const r = await s.recevoir(maj, 'a@x.fr');
    expect(r).toMatchObject({ decision: 'acceptee', caracteres: 7, restant: 9_993 });
    const journal = s.ddb.items('Journal');
    expect(journal).toHaveLength(2);
    expect(journal[1]).toMatchObject({ docId: 'doc1', auteur: 'a@x.fr', caracteres: 7 });
    // Ordre des écritures : crédit, puis journal.
    const noms = s.ddb.commandes.map((c) => `${c.nom}:${c.input.TableName}`);
    expect(noms.lastIndexOf('UpdateCommand:Credits')).toBeLessThan(noms.lastIndexOf('PutCommand:Journal'));
    expect(texte(s.ydoc)).toBe('bonjour');
  });

  it('refuse sans journaliser quand le crédit manque', async () => {
    const s = serveurSimule();
    await s.recevoir(Y.encodeStateAsUpdate(docInitial()), 'a@x.fr');
    s.ddb.put('Credits', { email: 'a@x.fr', jour: jourWat(s.horloge.ms), restant: 3 });
    const a = client(s.ydoc);
    const r = await s.recevoir(majDe(a, () => zoneTexte(a).insert(0, 'bonjour')), 'a@x.fr');
    expect(r).toMatchObject({ decision: 'refusee', raison: 'credit', restant: 3 });
    expect(s.ddb.items('Journal')).toHaveLength(1);
    expect(texte(s.ydoc)).toBe('');
  });

  it('une suppression est acceptée sans débit et ne rend pas de crédit (H-02)', async () => {
    const s = serveurSimule();
    await s.recevoir(Y.encodeStateAsUpdate(docInitial()), 'a@x.fr');
    const a = client(s.ydoc);
    await s.recevoir(majDe(a, () => zoneTexte(a).insert(0, 'abc')), 'a@x.fr');
    const r = await s.recevoir(majDe(a, () => zoneTexte(a).delete(0, 3)), 'a@x.fr');
    expect(r).toMatchObject({ decision: 'acceptee', caracteres: 0 });
    expect(s.ddb.get('Credits', { email: 'a@x.fr', jour: jourWat(s.horloge.ms) })?.restant).toBe(9_997);
  });

  it('refuse au-delà de la taille maximale du document', async () => {
    const s = serveurSimule();
    await s.recevoir(Y.encodeStateAsUpdate(docInitial()), 'a@x.fr');
    // Contenu déjà présent (chargé, sans débit) proche de la limite.
    const a = client(s.ydoc);
    Y.applyUpdate(s.ydoc, majDe(a, () => zoneTexte(a).insert(0, 'x'.repeat(TAILLE_MAX_DOCUMENT - 5))));
    const r = await s.recevoir(majDe(a, () => zoneTexte(a).insert(0, '0123456789')), 'a@x.fr');
    expect(r).toMatchObject({ decision: 'refusee', raison: 'taille' });
  });

  it('refuse un rédacteur bloqué', async () => {
    const s = serveurSimule();
    await s.recevoir(Y.encodeStateAsUpdate(docInitial()), 'a@x.fr');
    const a = client(s.ydoc);
    const r = await s.recevoir(majDe(a, () => zoneTexte(a).insert(0, 'a')), 'a@x.fr', s.horloge.ms + 1000);
    expect(r).toMatchObject({ decision: 'refusee', raison: 'bloque' });
  });

  it('SyncStep2 de reconnexion : ne débite que le nouveau, ignore le déjà reçu', async () => {
    const s = serveurSimule();
    await s.recevoir(Y.encodeStateAsUpdate(docInitial()), 'a@x.fr');
    const a = client(s.ydoc);
    await s.recevoir(majDe(a, () => zoneTexte(a).insert(0, 'abc')), 'a@x.fr');
    // Hors ligne, a écrit encore 2 caractères ; il renvoie tout son état.
    zoneTexte(a).insert(3, 'de');
    const r = await s.recevoir(Y.encodeStateAsUpdate(a), 'a@x.fr');
    expect(r).toMatchObject({ decision: 'acceptee', caracteres: 2 });
    // Un renvoi identique est ignoré : ni journal ni débit.
    const avant = s.ddb.items('Journal').length;
    expect(await s.recevoir(Y.encodeStateAsUpdate(a), 'a@x.fr')).toEqual({ decision: 'ignoree' });
    expect(s.ddb.items('Journal')).toHaveLength(avant);
    expect(texte(s.ydoc)).toBe('abcde');
  });

  it('journal en panne : pas d’acceptation et crédit remboursé', async () => {
    const s = serveurSimule();
    await s.recevoir(Y.encodeStateAsUpdate(docInitial()), 'a@x.fr');
    const a = client(s.ydoc);
    s.ddb.panne = (nom, input) => (nom === 'PutCommand' && input.TableName === 'Journal' ? new Error('panne') : undefined);
    await expect(s.recevoir(majDe(a, () => zoneTexte(a).insert(0, 'abc')), 'a@x.fr')).rejects.toThrow('panne');
    expect(s.ddb.get('Credits', { email: 'a@x.fr', jour: jourWat(s.horloge.ms) })?.restant).toBe(10_000);
    expect(s.suivi.enCours.size).toBe(0);
    expect(texte(s.ydoc)).toBe('');
  });
});

describe('convergence et redémarrage (C-2)', () => {
  it('deux rédacteurs qui insèrent au même endroit convergent, et le redémarrage ne perd rien', async () => {
    const s = serveurSimule();
    await s.recevoir(Y.encodeStateAsUpdate(docInitial()), 'a@x.fr');
    const a = client(s.ydoc);
    const b = client(s.ydoc);
    // Écriture simultanée au même endroit, sans s'être vus.
    const majA = majDe(a, () => zoneTexte(a).insert(0, 'AAA'));
    const majB = majDe(b, () => zoneTexte(b).insert(0, 'BBB'));
    const [ra, rb] = await Promise.all([s.recevoir(majA, 'a@x.fr'), s.recevoir(majB, 'b@x.fr')]);
    expect(ra.decision).toBe('acceptee');
    expect(rb.decision).toBe('acceptee');
    // Diffusion : chacun reçoit l'état du serveur.
    Y.applyUpdate(a, Y.encodeStateAsUpdate(s.ydoc));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(s.ydoc));
    const final = texte(s.ydoc);
    expect(final).toHaveLength(6);
    expect(final).toContain('AAA');
    expect(final).toContain('BBB');
    expect(texte(a)).toBe(final);
    expect(texte(b)).toBe(final);

    // Redémarrage : un nouveau processus reconstruit depuis S3 (vide) + journal.
    const relu = new Y.Doc();
    await reconstruire(s.deps, 'doc1', relu);
    expect(texte(relu)).toBe(final);

    // Après compactage, puis une modification de plus : S3 + fin du journal suffisent.
    await compacter(s.deps, 'doc1', Y.encodeStateAsUpdate(s.ydoc), s.suivi.seqEtat());
    s.horloge.ms += 60_000;
    await s.recevoir(majDe(a, () => zoneTexte(a).insert(6, '!')), 'a@x.fr');
    const relu2 = new Y.Doc();
    const r = await reconstruire(s.deps, 'doc1', relu2);
    expect(r.seqEtat).toBeDefined();
    expect(r.entreesRejouees).toBe(4); // 3 dans la marge de 10 s avant l'état, + la nouvelle
    expect(texte(relu2)).toBe(texte(s.ydoc));
  });

  it('une entrée journalisée mais pas encore appliquée reste relue après compactage', async () => {
    const s = serveurSimule();
    await s.recevoir(Y.encodeStateAsUpdate(docInitial()), 'a@x.fr');
    const a = client(s.ydoc);
    const maj = majDe(a, () => zoneTexte(a).insert(0, 'lent'));
    // Contrôle accepté (journal écrit) mais application retardée.
    const r = await controlerMiseAJour(s.deps, { docId: 'doc1', ydoc: s.ydoc, maj, email: 'a@x.fr', suivi: s.suivi });
    expect(r.decision).toBe('acceptee');
    // Une minute plus tard, une autre modification est acceptée et appliquée, puis on compacte.
    s.horloge.ms += 60_000;
    const b = client(s.ydoc);
    await s.recevoir(majDe(b, () => zoneTexte(b).insert(0, 'vite')), 'b@x.fr');
    await compacter(s.deps, 'doc1', Y.encodeStateAsUpdate(s.ydoc), s.suivi.seqEtat());
    const relu = new Y.Doc();
    await reconstruire(s.deps, 'doc1', relu);
    expect(texte(relu)).toContain('lent');
    expect(texte(relu)).toContain('vite');
  });
});

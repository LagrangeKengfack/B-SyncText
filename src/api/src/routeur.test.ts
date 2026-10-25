import { describe, expect, it } from 'vitest';
import { trouverRoute, type Route } from './routeur.js';
import { traiter } from './app.js';
import { creerFaux, entetes, T0 } from './faux.js';

describe('routeur', () => {
  const routes: Route<string>[] = [
    { methode: 'GET', motif: '/a/{x}', gestionnaire: 'ga' },
    { methode: 'POST', motif: '/a/{x}', gestionnaire: 'pa' },
    { methode: 'GET', motif: '/a/{x}/b/{y}', gestionnaire: 'gb' },
  ];
  it('extrait les paramètres et décode', () => {
    const r = trouverRoute(routes, 'GET', '/a/x%40y.fr/b/2');
    expect(r).toMatchObject({ params: { x: 'x@y.fr', y: '2' } });
  });
  it('distingue méthode inconnue et chemin inconnu', () => {
    expect(trouverRoute(routes, 'DELETE', '/a/1')).toEqual({ chemin: true });
    expect(trouverRoute(routes, 'GET', '/zzz')).toBeNull();
  });
});

async function appel(f: ReturnType<typeof creerFaux>, methode: string, chemin: string, email?: string, corps?: unknown, extra: Record<string, string> = {}) {
  return traiter(f.ctx, {
    methode,
    chemin,
    entetes: { ...entetes(email), ...extra },
    corps: corps === undefined ? undefined : typeof corps === 'string' ? corps : JSON.stringify(corps),
  });
}

describe('session et erreurs', () => {
  it('crée la fiche, normalise l’e-mail, renvoie crédit 10000', async () => {
    const f = creerFaux();
    const r = await appel(f, 'POST', '/api/session', undefined, { nom: 'Ana', email: '  ANA@Ex.FR ' });
    expect(r.statut).toBe(200);
    const c = r.corps as any;
    expect(c.redacteur.email).toBe('ana@ex.fr');
    expect(c.redacteur.credit.restant).toBe(10000);
    expect(c.redacteur.credit.rechargeA).toBeGreaterThan(T0);
    expect(c.jeton).toContain('.');
    expect(f.redacteurs.has('ana@ex.fr')).toBe(true);
  });
  it('lit le crédit du jour quand il existe', async () => {
    const f = creerFaux();
    f.credits.set('ana@ex.fr|2026-10-25', 1234);
    const r = await appel(f, 'POST', '/api/session', undefined, { nom: 'Ana', email: 'ana@ex.fr' });
    expect((r.corps as any).redacteur.credit.restant).toBe(1234);
  });
  it('400 sur e-mail invalide ou JSON cassé', async () => {
    const f = creerFaux();
    expect((await appel(f, 'POST', '/api/session', undefined, { nom: 'A', email: 'x' })).statut).toBe(400);
    expect((await appel(f, 'POST', '/api/session', undefined, '{oups')).statut).toBe(400);
  });
  it('401 sans jeton, 404 route inconnue, 405 mauvaise méthode', async () => {
    const f = creerFaux();
    expect((await appel(f, 'GET', '/api/moi')).statut).toBe(401);
    expect((await appel(f, 'GET', '/api/rien', 'a@b.fr')).statut).toBe(404);
    expect((await appel(f, 'DELETE', '/api/moi', 'a@b.fr')).statut).toBe(405);
  });
  it('500 neutre sans détail interne', async () => {
    const f = creerFaux();
    f.ctx.donnees.getRedacteur = async () => { throw new Error('SECRET-INTERNE'); };
    const r = await appel(f, 'GET', '/api/moi', 'a@b.fr');
    expect(r.statut).toBe(500);
    expect(JSON.stringify(r.corps)).not.toContain('SECRET-INTERNE');
  });
});

describe('documents', () => {
  it('crée, liste, lit avec lien d’invitation relatif', async () => {
    const f = creerFaux();
    const c = await appel(f, 'POST', '/api/documents', 'a@b.fr', { titre: ' Mon doc ' });
    expect(c.statut).toBe(201);
    const docId = (c.corps as any).docId;
    expect(f.documents.get(docId)).toMatchObject({ formatVersion: 'v.x.x', niv1: 0, niv2: 0, niv3: 0, titre: 'Mon doc' });
    expect(f.membres[0]).toMatchObject({ role: 'principal', email: 'a@b.fr' });
    const l = await appel(f, 'GET', '/api/documents', 'a@b.fr');
    expect((l.corps as any)[0]).toMatchObject({ docId, role: 'principal', connectes: 0 });
    const g = await appel(f, 'GET', `/api/documents/${docId}`, 'a@b.fr');
    expect((g.corps as any).lienInvitation).toMatch(/^\/invitation\//);
  });
  it('titre invalide → 400 ; non-membre → 403 ; doc inconnu → 404', async () => {
    const f = creerFaux();
    expect((await appel(f, 'POST', '/api/documents', 'a@b.fr', { titre: '' })).statut).toBe(400);
    expect((await appel(f, 'POST', '/api/documents', 'a@b.fr', { titre: 'x'.repeat(121) })).statut).toBe(400);
    const docId = ((await appel(f, 'POST', '/api/documents', 'a@b.fr', { titre: 'T' })).corps as any).docId;
    expect((await appel(f, 'GET', `/api/documents/${docId}`, 'z@b.fr')).statut).toBe(403);
    expect((await appel(f, 'GET', '/api/documents/inconnu', 'a@b.fr')).statut).toBe(404);
  });
  it('rédacteur bloqué : écriture 423, lecture permise', async () => {
    const f = creerFaux();
    f.redacteurs.set('a@b.fr', { email: 'a@b.fr', nom: 'A', creeLe: 0, bloqueJusqua: T0 + 1000 });
    expect((await appel(f, 'POST', '/api/documents', 'a@b.fr', { titre: 'T' })).statut).toBe(423);
    expect((await appel(f, 'GET', '/api/documents', 'a@b.fr')).statut).toBe(200);
    const s = await appel(f, 'POST', '/api/session', undefined, { nom: 'A', email: 'a@b.fr' });
    expect((s.corps as any).redacteur.bloqueJusqua).toBe(T0 + 1000);
  });
});

describe('invitation et membres', () => {
  async function prepare() {
    const f = creerFaux();
    const docId = ((await appel(f, 'POST', '/api/documents', 'p@b.fr', { titre: 'T' })).corps as any).docId;
    return { f, docId };
  }
  it('ajout par e-mail réservé aux propriétaires', async () => {
    const { f, docId } = await prepare();
    expect((await appel(f, 'POST', `/api/documents/${docId}/membres`, 'p@b.fr', { email: 'M@b.fr' })).statut).toBe(201);
    expect(f.membres.some((m) => m.email === 'm@b.fr' && m.role === 'membre')).toBe(true);
    expect((await appel(f, 'POST', `/api/documents/${docId}/membres`, 'm@b.fr', { email: 'x@b.fr' })).statut).toBe(403);
  });
  it('lien d’invitation : accepté, puis 410 après régénération', async () => {
    const { f, docId } = await prepare();
    const lien = ((await appel(f, 'GET', `/api/documents/${docId}`, 'p@b.fr')).corps as any).lienInvitation as string;
    const jeton = lien.replace('/invitation/', '');
    const ok = await appel(f, 'POST', `/api/invitations/${jeton}`, 'n@b.fr');
    expect(ok.corps).toEqual({ docId });
    await appel(f, 'POST', `/api/documents/${docId}/invitation`, 'p@b.fr');
    expect((await appel(f, 'POST', `/api/invitations/${jeton}`, 'k@b.fr')).statut).toBe(410);
    expect((await appel(f, 'POST', '/api/invitations/bidon', 'k@b.fr')).statut).toBe(404);
    // un simple membre ne voit pas le lien
    const vu = await appel(f, 'GET', `/api/documents/${docId}`, 'n@b.fr');
    expect((vu.corps as any).lienInvitation).toBeUndefined();
  });
});

describe('rôles (BF-21)', () => {
  async function prepare() {
    const f = creerFaux();
    const docId = ((await appel(f, 'POST', '/api/documents', 'p@b.fr', { titre: 'T' })).corps as any).docId;
    for (const e of ['o1@b.fr', 'o2@b.fr', 'm@b.fr']) await appel(f, 'POST', `/api/documents/${docId}/membres`, 'p@b.fr', { email: e });
    const role = (e: string) => f.membres.find((m) => m.email === e)!.role;
    const patch = (acteur: string, cible: string, r: string) =>
      appel(f, 'PATCH', `/api/documents/${docId}/membres/${encodeURIComponent(cible)}`, acteur, { role: r });
    return { f, docId, role, patch };
  }
  it('dernier propriétaire ne peut pas renoncer → 409', async () => {
    const { patch, role } = await prepare();
    expect((await patch('p@b.fr', 'p@b.fr', 'membre')).statut).toBe(409);
    expect(role('p@b.fr')).toBe('principal');
  });
  it('seul le principal retire le rôle à un autre', async () => {
    const { patch, role, f } = await prepare();
    f.membres.find((m) => m.email === 'o1@b.fr')!.nommeLe = 1;
    expect((await patch('p@b.fr', 'o1@b.fr', 'proprietaire')).statut).toBe(200);
    expect((await patch('p@b.fr', 'o2@b.fr', 'proprietaire')).statut).toBe(200);
    expect((await patch('o1@b.fr', 'o2@b.fr', 'membre')).statut).toBe(403);
    expect((await patch('m@b.fr', 'o2@b.fr', 'membre')).statut).toBe(403);
    expect((await patch('p@b.fr', 'o2@b.fr', 'membre')).statut).toBe(200);
    expect(role('o2@b.fr')).toBe('membre');
  });
  it('le principal qui renonce : le plus ancien propriétaire devient principal', async () => {
    const { patch, role, f } = await prepare();
    await patch('p@b.fr', 'o1@b.fr', 'proprietaire');
    await patch('p@b.fr', 'o2@b.fr', 'proprietaire');
    f.membres.find((m) => m.email === 'o1@b.fr')!.nommeLe = 100;
    f.membres.find((m) => m.email === 'o2@b.fr')!.nommeLe = 50;
    expect((await patch('p@b.fr', 'p@b.fr', 'membre')).statut).toBe(200);
    expect(role('p@b.fr')).toBe('membre');
    expect(role('o2@b.fr')).toBe('principal');
    expect(role('o1@b.fr')).toBe('proprietaire');
  });
  it('cible non membre → 404, rôle invalide → 400', async () => {
    const { patch } = await prepare();
    expect((await patch('p@b.fr', 'x@b.fr', 'membre')).statut).toBe(404);
    expect((await patch('p@b.fr', 'm@b.fr', 'principal')).statut).toBe(400);
  });
});

describe('versions, liens, tableau de bord', () => {
  it('version en lecture via versBlocs ; non-membre refusé', async () => {
    const f = creerFaux();
    const docId = ((await appel(f, 'POST', '/api/documents', 'p@b.fr', { titre: 'T' })).corps as any).docId;
    f.versions.push({ docId, versionId: 'v1', numero: 'v1', type: 'manuelle', auteur: 'p@b.fr', creeLe: 5, cleS3: `versions/${docId}/v1.bin` });
    f.etats.set(`versions/${docId}/v1.bin`, new Uint8Array([1, 2, 3]));
    const l = await appel(f, 'GET', `/api/documents/${docId}/versions`, 'p@b.fr');
    expect((l.corps as any)[0]).toMatchObject({ versionId: 'v1', horodatage: 5, auteurs: ['p@b.fr'] });
    const v = await appel(f, 'GET', `/api/documents/${docId}/versions/v1`, 'p@b.fr');
    expect((v.corps as any).contenu).toEqual({ octets: 3 });
    expect((await appel(f, 'GET', `/api/documents/${docId}/versions/v9`, 'p@b.fr')).statut).toBe(404);
    expect((await appel(f, 'GET', `/api/documents/${docId}/versions/v1`, 'z@b.fr')).statut).toBe(403);
  });
  it('lien : bornes de n, champs initiaux, liste', async () => {
    const f = creerFaux();
    const docId = ((await appel(f, 'POST', '/api/documents', 'p@b.fr', { titre: 'T' })).corps as any).docId;
    for (const n of [0, 10001, 1.5, '3']) {
      expect((await appel(f, 'POST', `/api/documents/${docId}/liens`, 'p@b.fr', { n })).statut).toBe(400);
    }
    const r = await appel(f, 'POST', `/api/documents/${docId}/liens`, 'p@b.fr', { n: 10000 });
    expect(r.statut).toBe(201);
    expect((r.corps as any).url).toMatch(/^\/l\//);
    expect(f.liens[0]).toMatchObject({ n: 10000, disponibles: 10000, comptes: 0, numerotation: 0, etat: 'actif', notifie: false, titre: 'T', creePar: 'p@b.fr' });
    const l = await appel(f, 'GET', `/api/documents/${docId}/liens`, 'p@b.fr');
    expect((l.corps as any)[0]).toMatchObject({ n: 10000, restants: 10000, etat: 'actif' });
  });
  it('tableau de bord : code, filtres et limite de 10 échecs', async () => {
    const f = creerFaux();
    f.documents.set('d1', { docId: 'd1', titre: 'Ouvert', creeLe: 0, creePar: 'a', modifieLe: 0, jetonInvitation: 'x', niv1: 0, niv2: 0, niv3: 0, connectes: 2, presenceMaj: T0 - 5000 });
    f.documents.set('d2', { docId: 'd2', titre: 'Vieux', creeLe: 0, creePar: 'a', modifieLe: 0, jetonInvitation: 'x', niv1: 0, niv2: 0, niv3: 0, connectes: 2, presenceMaj: T0 - 20000 });
    f.redacteurs.set('b@b.fr', { email: 'b@b.fr', nom: 'B', creeLe: 0, bloqueJusqua: T0 + 1, motifBlocage: 'abus' });
    const ok = await appel(f, 'GET', '/api/admin/tableau-de-bord', undefined, undefined, { 'x-code-admin': 'code-admin' });
    expect(ok.statut).toBe(200);
    const c = ok.corps as any;
    expect(c.documentsOuverts.map((x: any) => x.docId)).toEqual(['d1']);
    expect(c.bloques[0].email).toBe('b@b.fr');
    for (let i = 0; i < 10; i++) {
      expect((await appel(f, 'GET', '/api/admin/tableau-de-bord', undefined, undefined, { 'x-code-admin': 'faux' })).statut).toBe(403);
    }
    // 11e essai : 429, même avec le bon code
    expect((await appel(f, 'GET', '/api/admin/tableau-de-bord', undefined, undefined, { 'x-code-admin': 'code-admin' })).statut).toBe(429);
  });
});

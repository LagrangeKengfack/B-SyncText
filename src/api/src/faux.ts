// Faux accès aux données en mémoire, pour les tests.
import { signerJeton } from '@b-synctext/commun';
import type { Contexte, Document, Donnees, Lien, Membre, Redacteur, Version } from './types.js';

export const SECRET = 'secret-de-test';
export const CODE_ADMIN = 'code-admin';
export const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);

export function creerFaux() {
  const redacteurs = new Map<string, Redacteur>();
  const credits = new Map<string, number>();
  const documents = new Map<string, Document>();
  const membres: Membre[] = [];
  const versions: Version[] = [];
  const etats = new Map<string, Uint8Array>();
  const liens: Lien[] = [];
  const compteurs = new Map<string, number>();

  const d: Donnees = {
    async getRedacteur(e) { return redacteurs.get(e); },
    async assurerRedacteur(email, nom, now) {
      const r = { ...(redacteurs.get(email) ?? { email, creeLe: now }), nom };
      redacteurs.set(email, r);
      return r;
    },
    async getCredit(e, j) { return credits.get(`${e}|${j}`); },
    async creerDocument(doc, m) { documents.set(doc.docId, doc); membres.push(m); },
    async getDocument(id) { return documents.get(id); },
    async getDocuments(ids) { return ids.flatMap((i) => (documents.has(i) ? [documents.get(i)!] : [])); },
    async definirJetonInvitation(id, j) { documents.get(id)!.jetonInvitation = j; },
    async modifierDocument(id, c) { Object.assign(documents.get(id)!, c); },
    async getMembre(id, e) { return membres.find((m) => m.docId === id && m.email === e); },
    async listerMembres(id) { return membres.filter((m) => m.docId === id); },
    async listerMembresDe(e) { return membres.filter((m) => m.email === e); },
    async ajouterMembre(m) {
      if (membres.some((x) => x.docId === m.docId && x.email === m.email)) return false;
      membres.push(m);
      return true;
    },
    async changerRoles(id, ch) {
      for (const c of ch) membres.find((m) => m.docId === id && m.email === c.email)!.role = c.role;
    },
    async listerVersions(id) { return versions.filter((v) => v.docId === id); },
    async getVersion(id, v) { return versions.find((x) => x.docId === id && x.versionId === v); },
    async lireEtatVersion(cle) { return etats.get(cle); },
    async creerLien(l) { liens.push(l); },
    async listerLiens(id) { return liens.filter((l) => l.docId === id); },
    async incrementerCompteur(c) { const v = (compteurs.get(c) ?? 0) + 1; compteurs.set(c, v); return v; },
    async lireCompteur(c) { return compteurs.get(c) ?? 0; },
    async scanDocumentsOuverts(depuis) {
      return [...documents.values()].filter((x) => (x.connectes ?? 0) > 0 && (x.presenceMaj ?? 0) > depuis);
    },
    async scanLiensActifs() { return liens.filter((l) => l.etat === 'actif'); },
    async scanRedacteursBloques(now) { return [...redacteurs.values()].filter((r) => (r.bloqueJusqua ?? 0) > now); },
  };

  const ctx: Contexte = {
    donnees: d,
    secrets: { secretSession: async () => SECRET, codeAdmin: async () => CODE_ADMIN },
    maintenant: () => T0,
    versBlocs: (etat) => ({ octets: etat.length }),
  };
  return { ctx, redacteurs, credits, documents, membres, versions, etats, liens, compteurs };
}

export function jetonDe(email: string, nom = 'Test'): string {
  return signerJeton({ email, nom }, SECRET, T0);
}

export function entetes(email?: string): Record<string, string> {
  return email ? { authorization: `Bearer ${jetonDe(email)}` } : {};
}

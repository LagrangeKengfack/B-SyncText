// Utilitaires communs aux scripts de concurrence et de charge.
// Variable d'environnement : BASE_URL (ex. https://xxxx.cloudfront.net), sans barre finale.
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { extractText, getDocumentProxy } from 'unpdf';

export { Y };
export const BASE_URL = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const ici = dirname(fileURLToPath(import.meta.url));
export const DOSSIER_RESULTATS = join(ici, '..', '..', 'docs', 'tests', 'resultats');

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const idCourt = () => randomBytes(4).toString('hex');

export function exigerBaseUrl() {
  if (!BASE_URL) {
    console.error('BASE_URL manquant (ex. BASE_URL=https://xxxx.cloudfront.net)');
    process.exit(2);
  }
}

// Lecture des options de ligne de commande ; `def` donne les valeurs par défaut (chaînes).
export function options(def) {
  const spec = Object.fromEntries(Object.keys(def).map((k) => [k, { type: 'string' }]));
  spec.help = { type: 'boolean', short: 'h' };
  const { values } = parseArgs({ options: spec, strict: true });
  return { ...def, ...values };
}

export function percentile(valeurs, p) {
  if (!valeurs.length) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.ceil((p / 100) * t.length) - 1)];
}

// Exécute `taches` (fonctions async) avec au plus `limite` en parallèle.
export async function pool(taches, limite) {
  const res = new Array(taches.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, taches.length) }, async () => {
      while (i < taches.length) {
        const k = i++;
        res[k] = await taches[k]();
      }
    }),
  );
  return res;
}

// Appel HTTP JSON. Ne lève jamais : renvoie {statut, corps, entetes, ms} (statut 0 = erreur réseau).
export async function api(chemin, { methode = 'GET', jeton, corps, entetes = {}, brut = false, timeout = 30000 } = {}) {
  const h = { ...entetes };
  if (jeton) h.authorization = `Bearer ${jeton}`;
  if (corps !== undefined) h['content-type'] = 'application/json';
  const t0 = performance.now();
  try {
    const r = await fetch(BASE_URL + chemin, {
      method: methode,
      headers: h,
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
    const ms = performance.now() - t0;
    if (brut) return { statut: r.status, octets: Buffer.from(await r.arrayBuffer()), entetes: r.headers, ms };
    const texte = await r.text();
    let c = null;
    try { c = texte ? JSON.parse(texte) : null; } catch { c = texte; }
    return { statut: r.status, corps: c, entetes: r.headers, ms };
  } catch (e) {
    return { statut: 0, corps: null, erreur: String(e?.cause?.code ?? e?.message ?? e), ms: performance.now() - t0 };
  }
}

function exiger(rep, quoi, attendu = [200, 201]) {
  if (!attendu.includes(rep.statut)) {
    throw new Error(`${quoi} : statut ${rep.statut} ${JSON.stringify(rep.corps ?? rep.erreur)}`);
  }
  return rep.corps;
}

// Crée un rédacteur (POST /api/session) ; l'e-mail est unique par essai.
export async function creerSession(nom, email) {
  const c = exiger(await api('/api/session', { methode: 'POST', corps: { nom, email } }), 'POST /api/session');
  return { jeton: c.jeton, email, nom, redacteur: c.redacteur };
}

export async function creerDocument(jeton, titre) {
  const c = exiger(await api('/api/documents', { methode: 'POST', jeton, corps: { titre } }), 'POST /api/documents');
  return c.docId;
}

export async function creerLien(jeton, docId, n) {
  const c = exiger(await api(`/api/documents/${docId}/liens`, { methode: 'POST', jeton, corps: { n } }), 'POST liens');
  return c.lienId;
}

// Le propriétaire récupère le lien d'invitation ; renvoie le jeton d'invitation (dernier segment).
export async function jetonInvitation(jetonProprio, docId) {
  const c = exiger(await api(`/api/documents/${docId}`, { jeton: jetonProprio }), 'GET document');
  if (!c.lienInvitation) throw new Error('lienInvitation absent de GET /documents/{id}');
  return c.lienInvitation.split('/').filter(Boolean).pop();
}

export async function inviter(jeton, jetonInv) {
  return exiger(await api(`/api/invitations/${jetonInv}`, { methode: 'POST', jeton }), 'POST invitation').docId;
}

// Crée un document avec un propriétaire et `nbMembres` autres rédacteurs membres.
export async function preparerDocument(prefixe, nbMembres, titre = 'essai') {
  const run = idCourt();
  const proprio = await creerSession(`${prefixe} 0`, `${prefixe}-${run}-0@essai.example`);
  const docId = await creerDocument(proprio.jeton, `${titre} ${run}`);
  const membres = [proprio];
  if (nbMembres > 0) {
    const inv = await jetonInvitation(proprio.jeton, docId);
    const autres = await pool(
      Array.from({ length: nbMembres }, (_, i) => async () => {
        const s = await creerSession(`${prefixe} ${i + 1}`, `${prefixe}-${run}-${i + 1}@essai.example`);
        await inviter(s.jeton, inv);
        return s;
      }),
      10,
    );
    membres.push(...autres);
  }
  return { docId, proprio, membres };
}

// --- PDF ---
export async function texteDuPdf(octets) {
  const pdf = await getDocumentProxy(new Uint8Array(octets));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

// Numéro d'exemplaire : « Exemplaire k / N » dans le PDF, sinon en-tête Content-Disposition.
export async function lirePdf(rep) {
  const disp = rep.entetes?.get?.('content-disposition') ?? '';
  const mh = /exemplaire-(\d+)/i.exec(disp);
  const r = { octets: rep.octets.length, numeroEntete: mh ? Number(mh[1]) : null, numeroPdf: null, n: null, version: null, texte: '' };
  if (rep.octets.subarray(0, 5).toString() !== '%PDF-') { r.invalide = true; return r; }
  try {
    r.texte = await texteDuPdf(rep.octets);
    const m = /Exemplaire\s+(\d+)\s*\/\s*(\d+)/.exec(r.texte);
    if (m) { r.numeroPdf = Number(m[1]); r.n = Number(m[2]); }
    const v = /version\s+(v\d+(?:\.\d+)?)/i.exec(r.texte);
    if (v) r.version = v[1];
  } catch (e) {
    r.erreurPdf = String(e?.message ?? e);
  }
  r.numero = r.numeroPdf ?? r.numeroEntete;
  return r;
}

// Un visiteur : demande, réessaie tant que « patientez »/429/erreur, télécharge si « pret ».
export async function visiteur(lienId, { echeanceMs = 180000, onReponse } = {}) {
  const fin = Date.now() + echeanceMs;
  const v = { etats: [], pdf: null, ticket: null, final: null, dejaPatiente: false, tFinal: null };
  for (;;) {
    const rep = await api(`/api/liens/${lienId}/demandes`, { methode: 'POST' });
    const etat = rep.statut === 200 ? rep.corps?.etat : rep.statut === 429 ? '429' : `http${rep.statut}`;
    v.etats.push(etat);
    onReponse?.(rep, etat);
    if (etat === 'pret') {
      v.ticket = rep.corps.ticket;
      const f = await api(`/api/liens/${lienId}/fichier?ticket=${encodeURIComponent(v.ticket)}`, { brut: true });
      v.statutFichier = f.statut;
      if (f.statut === 200) { v.pdf = await lirePdf(f); v.final = 'pdf'; } else v.final = `fichier${f.statut}`;
      break;
    }
    if (etat === 'epuise') { v.final = 'epuise'; break; }
    if (etat === 'patientez' || etat === '429') v.dejaPatiente = true;
    if (Date.now() >= fin) { v.final = 'abandon'; break; }
    await dormir((etat === 'patientez' ? (rep.corps?.reessayerDans ?? 2) : 2) * 1000);
  }
  v.tFinal = Date.now();
  return v;
}

// --- Résultats ---
export function ecrireResultat(test, donnees) {
  mkdirSync(DOSSIER_RESULTATS, { recursive: true });
  const d = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  const fichier = join(DOSSIER_RESULTATS, `${test}-${d}.json`);
  writeFileSync(fichier, JSON.stringify({ test, date: new Date().toISOString(), baseUrl: BASE_URL, ...donnees }, null, 2));
  console.log(`Résultats : ${fichier}`);
  console.log(`Verdict : ${donnees.verdict}`);
  return fichier;
}

// --- Clients Yjs ---
export const urlCollab = () => BASE_URL.replace(/^http/, 'ws') + '/collab';

// Client Hocuspocus. `inserer` renvoie une promesse résolue à l'accusé du serveur
// (message `credit` = 'ok', message `refus` = 'refus', délai dépassé = 'incertain').
export class ClientYjs {
  constructor({ docId, jeton, nom, reinitialiser = true, url }) {
    Object.assign(this, { docId, jeton, nom, reinitialiser, url: url ?? urlCollab() });
    this.attente = []; // insertions en attente d'accusé
    this.confirmes = []; this.refuses = []; this.incertains = [];
    this.credit = null; this.dernierRefus = null; this.messages = []; this.nbReinit = 0;
    this.surMessage = null;
    this.creer();
  }

  creer() {
    this.doc = new Y.Doc();
    this.synchro = new Promise((res) => { this._resSync = res; });
    this.provider = new HocuspocusProvider({
      url: this.url, name: this.docId, token: this.jeton, document: this.doc, WebSocketPolyfill: WebSocket,
      onSynced: () => this._resSync(),
      onStateless: ({ payload }) => this.recevoir(payload),
      onAuthenticationFailed: ({ reason }) => this.messages.push({ type: 'authEchec', reason }),
    });
  }

  recevoir(payload) {
    let m; try { m = JSON.parse(payload); } catch { return; }
    this.messages.push({ ...m, t: Date.now() });
    this.surMessage?.(m);
    if (m.type === 'credit') {
      this.credit = m;
      const e = this.attente.shift();
      if (e) { this.confirmes.push(e.marque); e.res('ok'); }
    } else if (m.type === 'refus') {
      this.dernierRefus = m;
      const e = this.attente.shift();
      if (e) { this.refuses.push(e.marque); e.res('refus'); }
      // Les suivantes ne sont plus fiables : le document local est jeté.
      for (const x of this.attente.splice(0)) { this.incertains.push(x.marque); x.res('incertain'); }
      if (this.reinitialiser) this.recreer();
    }
  }

  recreer() {
    this.nbReinit++;
    try { this.provider.destroy(); } catch { /* déjà détruit */ }
    this.doc.destroy();
    this.creer();
  }

  async attendreSync(ms = 20000) {
    await Promise.race([this.synchro, dormir(ms).then(() => { throw new Error(`synchro > ${ms} ms (${this.nom})`); })]);
  }

  get fragment() { return this.doc.getXmlFragment('default'); }

  // Crée le paragraphe Tiptap (XmlElement 'paragraph' contenant un XmlText) s'il n'existe pas.
  preparerParagraphe() {
    if (this.noeudTexte()) return;
    this.doc.transact(() => {
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText()]);
      this.fragment.insert(0, [p]);
    });
  }

  noeudTexte() {
    const p = this.fragment.get(0);
    const t = p instanceof Y.XmlElement ? p.get(0) : null;
    return t instanceof Y.XmlText ? t : null;
  }

  async attendreParagraphe(ms = 20000) {
    const fin = Date.now() + ms;
    while (!this.noeudTexte()) {
      if (Date.now() > fin) throw new Error(`paragraphe absent (${this.nom})`);
      await dormir(50);
    }
  }

  // Insère `texte` à `position` (0 = début, 'fin' = à la fin). Résolue à l'accusé.
  inserer(texte, position = 0, delaiMs = 20000) {
    const t = this.noeudTexte();
    if (!t) throw new Error('paragraphe absent');
    return new Promise((res) => {
      const e = { marque: texte, res };
      this.attente.push(e);
      t.insert(position === 'fin' ? t.length : position, texte);
      setTimeout(() => {
        const i = this.attente.indexOf(e);
        if (i >= 0) { this.attente.splice(i, 1); this.incertains.push(texte); res('incertain'); }
      }, delaiMs).unref();
    });
  }

  texte() { return this.fragment.toString(); }

  async viderEnvoi(ms = 20000) {
    const fin = Date.now() + ms;
    while (this.provider.hasUnsyncedChanges && Date.now() < fin) await dormir(50);
    return !this.provider.hasUnsyncedChanges;
  }

  fermer() { try { this.provider.destroy(); } catch { /* ignoré */ } this.doc.destroy(); }
}

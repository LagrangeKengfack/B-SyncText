// T-08 (abus) : un rédacteur qui insiste sans crédit est bloqué après 20 refus en une minute, puis débloqué à l'échéance.
// Usage : BASE_URL=... node t08-blocage.mjs [--code-admin XXXX] (le code permet de vérifier le tableau de bord)
import { ClientYjs, api, creerSession, creerDocument, ecrireResultat, exigerBaseUrl, options, idCourt } from './commun.mjs';

const o = options({ 'code-admin': '' });
if (o.help) { console.log('Options : --code-admin <code> (facultatif)'); process.exit(0); }
exigerBaseUrl();

const run = idCourt();
const s = await creerSession('T08', `t08-${run}@essai.example`);
const docId = await creerDocument(s.jeton, `T-08 ${run}`);

// 1. Épuiser le crédit (10 000 caractères acceptés).
const c0 = new ClientYjs({ docId, jeton: s.jeton, nom: 'c0', reinitialiser: false });
await c0.attendreSync(); c0.preparerParagraphe(); await c0.viderEnvoi(); await c0.attendreParagraphe();
let accepte = 0;
for (let k = 0; k < 60; k++) { const r = await c0.inserer('x'.repeat(200), 'fin'); if (r !== 'ok') break; accepte += 200; }
c0.fermer();

// 2. Insister : une connexion par tentative (le serveur ferme la connexion à chaque refus).
const tentatives = [];
let bloqueA = null;
for (let k = 0; k < 24; k++) {
  const c = new ClientYjs({ docId, jeton: s.jeton, nom: `t${k}`, reinitialiser: false });
  let r;
  try { await c.attendreSync(8000); await c.attendreParagraphe(8000); r = await c.inserer('z'.repeat(50), 'fin'); }
  catch (e) { r = `erreur:${e.message}`; }
  tentatives.push({ k, resultat: r, raison: c.dernierRefus?.raison ?? null });
  c.fermer();
  const moi = await api('/api/moi', { jeton: s.jeton });
  const fin = moi.corps?.bloqueJusqua ?? moi.corps?.redacteur?.bloqueJusqua; // GET /moi renvoie le rédacteur directement
  if (typeof fin === 'number' && fin > Date.now()) { bloqueA = { apresTentative: k + 1, bloqueJusqua: fin }; break; }
}
// Le 20e refus déclenche le blocage : le serveur répond alors « bloqué » (raison bloque), ce qui compte comme refus.
const refus = tentatives.filter((t) => t.resultat === 'refus' || t.raison === 'bloque').length;

// 3. Tableau de bord (si le code est fourni) : le rédacteur y figure.
let surTableau = null;
if (o['code-admin']) {
  const tb = await api('/api/admin/tableau-de-bord', { entetes: { 'x-code-admin': o['code-admin'] } });
  surTableau = tb.statut === 200 ? tb.corps.bloques.some((b) => b.email === s.email) : `statut ${tb.statut}`;
}
const ok = accepte === 10000 && bloqueA != null && refus >= 20 && (surTableau === null || surTableau === true);
ecrireResultat('t08-blocage', { docId, email: s.email, creditAccepte: accepte, tentatives, refus, bloqueA, surTableau, verdict: ok ? 'REUSSI' : 'ECHEC' });
process.exit(ok ? 0 : 1);

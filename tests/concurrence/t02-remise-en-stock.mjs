// T-02 (C-1) : 10 réservations jamais utilisées, puis 20 visiteurs qui patientent ; après ~60 s les 10 exemplaires sont servis.
// Usage : BASE_URL=... node t02-remise-en-stock.mjs [--n 10] [--visiteurs 20] [--echeance 150]
import { api, creerSession, creerDocument, creerLien, visiteur, ecrireResultat, exigerBaseUrl, options } from './commun.mjs';

const o = options({ n: '10', visiteurs: '20', echeance: '150' });
if (o.help) { console.log('Options : --n 10  --visiteurs 20  --echeance 150 (s)'); process.exit(0); }
exigerBaseUrl();
const N = Number(o.n), V = Number(o.visiteurs);

const run = Date.now().toString(36);
const proprio = await creerSession('T02', `t02-${run}@essai.example`);
const docId = await creerDocument(proprio.jeton, `T-02 ${run}`);
const lienId = await creerLien(proprio.jeton, docId, N);

// N réservations jamais utilisées.
const reservations = await Promise.all(Array.from({ length: N }, () => api(`/api/liens/${lienId}/demandes`, { methode: 'POST' })));
const tickets = reservations.filter((r) => r.corps?.etat === 'pret').map((r) => r.corps.ticket);
const expireA = Math.max(...reservations.map((r) => Date.parse(r.corps?.expireA) || Number(r.corps?.expireA) || 0));
console.log(`${tickets.length}/${N} réservations obtenues`);

const t0 = Date.now();
const vs = await Promise.all(Array.from({ length: V }, () => visiteur(lienId, { echeanceMs: Number(o.echeance) * 1000 })));
const servis = vs.filter((v) => v.final === 'pdf');
const numeros = servis.map((v) => v.pdf.numero).sort((a, b) => a - b);
const premierServiS = servis.length ? (Math.min(...servis.map((v) => v.tFinal)) - t0) / 1000 : null;
const dernierServiS = servis.length ? (Math.max(...servis.map((v) => v.tFinal)) - t0) / 1000 : null;
const finals = {};
for (const v of vs) finals[v.final] = (finals[v.final] ?? 0) + 1;

// Les tickets réservés mais périmés ne doivent plus donner de fichier.
const anciens = await Promise.all(tickets.map(async (t) => (await api(`/api/liens/${lienId}/fichier?ticket=${encodeURIComponent(t)}`, { brut: true })).statut));
const anciensServis = anciens.filter((s) => s === 200).length;

const unique = new Set(numeros).size === numeros.length && numeros.every((k) => k >= 1 && k <= N);
const ok = servis.length === N && unique && anciensServis === 0 && (finals.epuise ?? 0) === V - N && !finals.abandon;
ecrireResultat('t02-remise-en-stock', {
  parametres: { N, visiteurs: V }, lienId, reservationsObtenues: tickets.length, expireAReservations: expireA || null,
  servis: servis.length, numeros, etatFinal: finals, premierServiApresDebutS: premierServiS, dernierServiApresDebutS: dernierServiS,
  anciensTicketsStatuts: anciens, anciensServis, verdict: ok ? 'REUSSI' : 'ECHEC',
});
process.exit(ok ? 0 : 1);

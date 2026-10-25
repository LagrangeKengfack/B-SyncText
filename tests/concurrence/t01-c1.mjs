// T-01 (C-1) : M demandes simultanées sur un lien de N exemplaires -> exactement N PDF, numéros 1..N.
// Usage : BASE_URL=https://xxx.cloudfront.net node t01-c1.mjs [--n 1,500] [--m 1000] [--repetitions 5] [--concurrence 1000]
import { api, creerSession, creerDocument, creerLien, visiteur, pool, ecrireResultat, exigerBaseUrl, options, percentile } from './commun.mjs';

const o = options({ n: '1,500', m: '1000', repetitions: '1', concurrence: '1000', echeance: '180' });
if (o.help) { console.log('Options : --n 1,500  --m 1000  --repetitions 1  --concurrence 1000  --echeance 180 (s)'); process.exit(0); }
exigerBaseUrl();
const Ns = o.n.split(',').map(Number), M = Number(o.m), REP = Number(o.repetitions);

async function essai(N, rep, jeton, docId) {
  const lienId = await creerLien(jeton, docId, N);
  const t0 = Date.now();
  const visiteurs = await pool(
    Array.from({ length: M }, () => () => visiteur(lienId, { echeanceMs: Number(o.echeance) * 1000 })),
    Number(o.concurrence),
  );
  const duree = Date.now() - t0;
  const pdfs = visiteurs.filter((v) => v.final === 'pdf');
  const premiers = {};
  for (const v of visiteurs) premiers[v.etats[0]] = (premiers[v.etats[0]] ?? 0) + 1;
  const finals = {};
  for (const v of visiteurs) finals[v.final] = (finals[v.final] ?? 0) + 1;
  const numeros = pdfs.map((v) => v.pdf.numero);
  const ensemble = new Set(numeros);
  const attendus = Array.from({ length: N }, (_, i) => i + 1);
  const manquants = attendus.filter((k) => !ensemble.has(k));
  const horsPlage = numeros.filter((k) => !(k >= 1 && k <= N));
  const doublons = numeros.length - ensemble.size;
  const incoherentEntete = pdfs.filter((v) => v.pdf.numeroPdf != null && v.pdf.numeroEntete != null && v.pdf.numeroPdf !== v.pdf.numeroEntete).length;
  const sansNumeroPdf = pdfs.filter((v) => v.pdf.numeroPdf == null).length;

  // Réutilisation d'un ticket déjà consommé -> 410.
  const aTester = pdfs.slice(0, Math.min(pdfs.length, 50));
  const reutil = await pool(aTester.map((v) => async () => (await api(`/api/liens/${lienId}/fichier?ticket=${encodeURIComponent(v.ticket)}`, { brut: true })).statut), 20);
  const reutilisationNon410 = reutil.filter((s) => s !== 410).length;

  // Demandes suivantes -> epuise.
  const suivantes = await pool(Array.from({ length: 100 }, () => async () => (await api(`/api/liens/${lienId}/demandes`, { methode: 'POST' })).corps?.etat), 50);
  const suivantesNonEpuise = suivantes.filter((e) => e !== 'epuise').length;

  const ok = pdfs.length === N && manquants.length === 0 && doublons === 0 && horsPlage.length === 0
    && reutilisationNon410 === 0 && suivantesNonEpuise === 0 && !finals.abandon;
  const lat = pdfs.length ? null : null;
  return {
    N, repetition: rep, lienId, M, dureeMs: duree, ok,
    pdfRecus: pdfs.length, manquants: manquants.slice(0, 20), nbManquants: manquants.length, doublons, horsPlage,
    premiereReponse: premiers, etatFinal: finals, incoherentEntete, sansNumeroPdf,
    ticketsReutilisesTestes: aTester.length, reutilisationNon410, suivantesTestees: suivantes.length, suivantesNonEpuise,
    nbReponses429: visiteurs.reduce((s, v) => s + v.etats.filter((e) => e === '429').length, 0),
    nbReponsesInattendues: visiteurs.reduce((s, v) => s + v.etats.filter((e) => !['pret', 'patientez', 'epuise', '429'].includes(e)).length, 0),
    numeros: numeros.sort((a, b) => a - b), lat,
  };
}

const run = Date.now().toString(36);
const proprio = await creerSession('T01', `t01-${run}@essai.example`);
const docId = await creerDocument(proprio.jeton, `T-01 ${run}`);
const essais = [];
for (const N of Ns) for (let r = 1; r <= REP; r++) {
  console.log(`N=${N} répétition ${r}/${REP} : ${M} demandes...`);
  const e = await essai(N, r, proprio.jeton, docId);
  console.log(`  -> ${e.ok ? 'OK' : 'ECHEC'} : ${e.pdfRecus} PDF, ${e.nbManquants} manquants, ${e.doublons} doublons, ${e.dureeMs} ms`);
  essais.push(e);
}
const tout = essais.every((e) => e.ok);
ecrireResultat('t01-c1', { parametres: { Ns, M, repetitions: REP }, essais, verdict: tout ? 'REUSSI' : 'ECHEC' });
process.exit(tout ? 0 : 1);

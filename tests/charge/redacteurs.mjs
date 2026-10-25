// Charge d'écriture parallèle à T-06 : 300 rédacteurs Yjs sur 30 documents de 10, ~2 insertions/s chacun.
// Mesure la latence de propagation (marqueur horodaté vu par un autre client). Écrit p50/p95 dans un JSON.
// Usage : BASE_URL=... node redacteurs.mjs [--redacteurs 300] [--groupe 10] [--duree 240] [--rythme 2] [--attente-debut 0]
// Crédit : ~17 caractères par marqueur ; 10 000 caractères par jour -> au plus ~580 insertions par rédacteur
//   (l'insertion est arrêtée côté client à 9 500 caractères).
import { ClientYjs, Y, preparerDocument, pool, dormir, percentile, ecrireResultat, exigerBaseUrl, options } from '../concurrence/commun.mjs';

const o = options({ redacteurs: '300', groupe: '10', duree: '240', rythme: '2', 'attente-debut': '0' });
if (o.help) { console.log('Options : --redacteurs 300  --groupe 10  --duree 240 (s)  --rythme 2 (insertions/s/rédacteur)  --attente-debut 0 (s avant de commencer)'); process.exit(0); }
exigerBaseUrl();
const R = Number(o.redacteurs), G = Number(o.groupe), DUREE = Number(o.duree) * 1000, RYTHME = Number(o.rythme);
const NB_DOCS = Math.ceil(R / G);
const RE = /\[(\d+)\.(\d+)\.([0-9a-z]+)\]/g;

console.log(`préparation : ${NB_DOCS} documents, ${R} rédacteurs...`);
const docs = await pool(Array.from({ length: NB_DOCS }, (_, d) => () => preparerDocument(`red${d}`, Math.min(G, R - d * G) - 1, `charge ${d}`)), 5);

const latences = [];
let envoyees = 0, accuses = 0, refus = 0, erreurs = 0, vus = 0;
let debutMesure = Infinity;
const clients = [];
for (const [d, doc] of docs.entries()) {
  for (const [j, m] of doc.membres.entries()) {
    const idx = d * G + j;
    const c = new ClientYjs({ docId: doc.docId, jeton: m.jeton, nom: `r${idx}`, reinitialiser: false });
    c.idx = idx; c.doc_ = doc; c.premier = j === 0;
    // Latence : on lit les caractères insérés par les mises à jour distantes uniquement.
    c.doc.on('update', (maj, origine) => {
      if (origine === null || origine === undefined || origine === 'local') return;
      try {
        for (const s of Y.decodeUpdate(maj).structs) {
          const str = s.content?.str;
          if (!str) continue;
          for (const mm of str.matchAll(RE)) {
            const ts = parseInt(mm[3], 36);
            if (Number(mm[1]) !== idx && ts >= debutMesure) { latences.push(Date.now() - ts); vus++; }
          }
        }
      } catch { /* mise à jour non décodable : ignorée */ }
    });
    clients.push(c);
  }
}
// Connexions par lots pour ne pas saturer le démarrage.
await pool(clients.map((c) => async () => { try { await c.attendreSync(30000); } catch { erreurs++; } }), 30);
for (const c of clients.filter((x) => x.premier)) { c.preparerParagraphe(); }
await dormir(2000);
await pool(clients.map((c) => async () => { try { await c.attendreParagraphe(30000); } catch { erreurs++; } }), 50);
if (Number(o['attente-debut'])) { console.log(`attente ${o['attente-debut']} s...`); await dormir(Number(o['attente-debut']) * 1000); }

console.log(`mesure pendant ${DUREE / 1000} s...`);
const t0 = Date.now();
debutMesure = t0;
await Promise.all(clients.map(async (c) => {
  if (!c.noeudTexte()) return;
  let seq = 0, chars = 0;
  await dormir(Math.random() * 1000 / RYTHME);
  while (Date.now() - t0 < DUREE) {
    const marque = `[${c.idx}.${seq++}.${Date.now().toString(36)}]`;
    if (chars + marque.length > 9500) break; // reste sous le crédit du jour
    chars += marque.length;
    envoyees++;
    c.inserer(marque, 'fin').then((r) => { if (r === 'ok') accuses++; else if (r === 'refus') refus++; });
    await dormir((1000 / RYTHME) * (0.8 + Math.random() * 0.4));
  }
}));
await dormir(3000);
clients.forEach((c) => c.fermer());

const p50 = percentile(latences, 50), p95 = percentile(latences, 95);
ecrireResultat('redacteurs', {
  parametres: { redacteurs: R, tailleGroupe: G, documents: NB_DOCS, dureeS: DUREE / 1000, rythme: RYTHME },
  insertionsEnvoyees: envoyees, accusesCredit: accuses, refus, erreursConnexion: erreurs, observationsLatence: vus,
  latenceMs: { p50, p95, p99: percentile(latences, 99), max: latences.length ? latences.reduce((a, b) => (b > a ? b : a), -Infinity) : null },
  seuil: 'p95 < 1000 ms (T-06)', verdict: p95 != null && p95 < 1000 && erreurs === 0 && refus === 0 ? 'REUSSI' : 'ECHEC',
});

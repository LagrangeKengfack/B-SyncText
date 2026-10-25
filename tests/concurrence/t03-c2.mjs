// T-03 (C-2) : 50 clients Yjs insèrent au même endroit pendant 60 s ; convergence et absence de perte.
// Usage : BASE_URL=... node t03-c2.mjs [--clients 50] [--duree 60] [--intervalle 400] [--redemarrer-a 30]
// --redemarrer-a <s> : n'agit pas sur le serveur. Le script affiche un rappel à cet instant ;
//   le redémarrage du serveur d'édition se fait à la main (SSM) pendant l'essai.
import { ClientYjs, preparerDocument, dormir, sha256, ecrireResultat, exigerBaseUrl, options, percentile } from './commun.mjs';

const o = options({ clients: '50', duree: '60', intervalle: '400', 'redemarrer-a': '' });
if (o.help) { console.log('Options : --clients 50  --duree 60 (s)  --intervalle 400 (ms entre insertions)  --redemarrer-a <s> (rappel, redémarrage manuel par SSM)'); process.exit(0); }
exigerBaseUrl();
const C = Number(o.clients), DUREE = Number(o.duree) * 1000, INTERVALLE = Number(o.intervalle);

const { docId, proprio, membres } = await preparerDocument('t03', C - 1, 'T-03');
console.log(`document ${docId}, ${membres.length} rédacteurs membres`);

const clients = membres.map((m, i) => new ClientYjs({ docId, jeton: m.jeton, nom: `c${i}` }));
await Promise.all(clients.map((c) => c.attendreSync()));
clients[0].preparerParagraphe();
await clients[0].viderEnvoi();
await Promise.all(clients.map((c) => c.attendreParagraphe()));

const debut = Date.now();
const marqueurs = clients.map(() => []);
if (o['redemarrer-a']) setTimeout(() => console.log('>>> MAINTENANT : redémarrer le serveur d\'édition (SSM)'), Number(o['redemarrer-a']) * 1000);

await Promise.all(clients.map(async (c, i) => {
  let k = 0;
  while (Date.now() - debut < DUREE) {
    const m = `[c${String(i).padStart(2, '0')}-${k++}]`;
    marqueurs[i].push(m);
    c.inserer(m, 0); // même position pour tous : écriture simultanée au même endroit
    await dormir(INTERVALLE * (0.5 + Math.random()));
  }
}));
const finEcriture = Date.now();
console.log('écriture terminée, attente de la convergence...');

// Convergence : tous les clients ont vidé leur envoi et ont la même empreinte.
async function empreintes() { return clients.map((c) => sha256(c.texte())); }
let convergenceMs = null;
while (Date.now() - finEcriture < 60000) {
  const h = await empreintes();
  if (clients.every((c) => !c.provider.hasUnsyncedChanges) && new Set(h).size === 1) { convergenceMs = Date.now() - finEcriture; break; }
  await dormir(100);
}
await dormir(2000); // laisse arriver les derniers accusés
const h = await empreintes();
const texteRef = clients[0].texte();
const identiques = new Set(h).size === 1;

// Marqueurs confirmés (accusé « credit », non suivi d'un refus) présents dans le texte final.
const confirmes = clients.flatMap((c) => c.confirmes);
const manquants = confirmes.filter((m) => !texteRef.includes(m));
const tousEnvoyes = marqueurs.flat();
const nonConfirmes = tousEnvoyes.length - confirmes.length;
const presentsNonConfirmes = tousEnvoyes.filter((m) => !confirmes.includes(m) && texteRef.includes(m)).length;
const refus = clients.flatMap((c) => c.messages.filter((m) => m.type === 'refus'));

// Client neuf : état rechargé depuis le serveur (journal + S3 après redémarrage éventuel).
const neuf = new ClientYjs({ docId, jeton: proprio.jeton, nom: 'neuf' });
await neuf.attendreSync();
await dormir(1500);
const hNeuf = sha256(neuf.texte());
const neufIdentique = hNeuf === h[0];
const manquantsNeuf = confirmes.filter((m) => !neuf.texte().includes(m));
neuf.fermer();
clients.forEach((c) => c.fermer());

const ok = identiques && manquants.length === 0 && neufIdentique && convergenceMs != null && convergenceMs < 5000;
ecrireResultat('t03-c2', {
  parametres: { clients: C, dureeS: DUREE / 1000, intervalleMs: INTERVALLE, redemarrerA: o['redemarrer-a'] || null }, docId,
  marqueursEnvoyes: tousEnvoyes.length, confirmes: confirmes.length, nonConfirmes, presentsParmiNonConfirmes: presentsNonConfirmes,
  refus: refus.length, reinitialisations: clients.reduce((s, c) => s + c.nbReinit, 0),
  manquantsConfirmes: manquants.slice(0, 50), nbManquantsConfirmes: manquants.length,
  empreintes: { distinctes: new Set(h).size, reference: h[0], clientNeuf: hNeuf }, identiques, neufIdentique,
  manquantsClientNeuf: manquantsNeuf.length, convergenceMs, longueurTexte: texteRef.length,
  messagesAuth: clients.flatMap((c) => c.messages.filter((m) => m.type === 'authEchec')).length,
  verdict: ok ? 'REUSSI' : 'ECHEC',
});
process.exit(ok ? 0 : 1);

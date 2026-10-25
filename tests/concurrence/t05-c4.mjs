// T-05 (C-4) : 3 clients du même rédacteur écrivent en parallèle jusqu'au refus ; total accepté <= crédit.
// Usage : BASE_URL=... node t05-c4.mjs [--appareils 3] [--taille 200]
import { ClientYjs, api, creerSession, creerDocument, ecrireResultat, exigerBaseUrl, options, idCourt } from './commun.mjs';

const o = options({ appareils: '3', taille: '200' });
if (o.help) { console.log('Options : --appareils 3  --taille 200 (caractères par insertion)'); process.exit(0); }
exigerBaseUrl();
const A = Number(o.appareils), T = Number(o.taille);

const run = idCourt();
const s = await creerSession('T05', `t05-${run}@essai.example`);
const docId = await creerDocument(s.jeton, `T-05 ${run}`);
const credit0 = s.redacteur?.credit?.restant ?? 10000;
const clients = Array.from({ length: A }, (_, i) => new ClientYjs({ docId, jeton: s.jeton, nom: `appareil${i}`, reinitialiser: false }));
await Promise.all(clients.map((c) => c.attendreSync()));
clients[0].preparerParagraphe();
await clients[0].viderEnvoi();
await Promise.all(clients.map((c) => c.attendreParagraphe()));

const accepte = clients.map(() => 0);
const refus = clients.map(() => 0);
// Chaque appareil envoie un bloc à la fois (attend l'accusé) jusqu'au premier refus.
await Promise.all(clients.map(async (c, i) => {
  for (let k = 0; k < 1000; k++) {
    const r = await c.inserer('x'.repeat(T), 'fin');
    if (r === 'ok') accepte[i] += T;
    else { if (r === 'refus') refus[i]++; break; }
  }
}));
const total = accepte.reduce((a, b) => a + b, 0);
const moi = await api('/api/moi', { jeton: s.jeton });
const restant = moi.corps?.credit?.restant ?? null;

// Après refus, un nouvel appareil doit aussi être refusé (rien d'accepté de plus).
const extra = new ClientYjs({ docId, jeton: s.jeton, nom: 'extra', reinitialiser: false });
await extra.attendreSync(); await extra.attendreParagraphe();
const rExtra = await extra.inserer('y'.repeat(T), 'fin');
extra.fermer();
clients.forEach((c) => c.fermer());

const ok = total <= credit0 && restant != null && credit0 - restant === total && rExtra !== 'ok' && refus.every((n) => n >= 1);
ecrireResultat('t05-c4', {
  parametres: { appareils: A, tailleBloc: T }, docId, creditInitial: credit0, accepteParAppareil: accepte, refusParAppareil: refus,
  totalAccepte: total, creditRestantServeur: restant, debite: restant != null ? credit0 - restant : null, insertionApresRefus: rExtra,
  derniersRefus: clients.map((c) => c.dernierRefus), verdict: ok ? 'REUSSI' : 'ECHEC',
});
process.exit(ok ? 0 : 1);

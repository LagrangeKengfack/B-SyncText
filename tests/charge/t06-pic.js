// T-06 / T-07 (C-5, C-6) : pic de visiteurs sur un lien. 12 000 visiteurs sur 60 s, puis 3 000 sur 4 min.
// Usage : k6 run -e BASE_URL=https://xxx.cloudfront.net -e LIEN_ID=... --summary-export=resume.json t06-pic.js
// Variables : BASE_URL, LIEN_ID (obligatoires) ; ECHELLE (défaut 1, ex. 0.01 pour un essai à blanc) ;
//   VU_MAX (défaut 16000, chaque visiteur en attente occupe un VU : prévoir la mémoire du générateur) ;
//   RESUME_JSON (chemin du résumé complet écrit par handleSummary, défaut resume-t06.json).
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || '').replace(/\/+$/, '');
const LIEN = __ENV.LIEN_ID;
const ECH = Number(__ENV.ECHELLE || 1);
const MAX_ATTENTE_S = 180;

// Taux par tranche de 2 s pour pouvoir viser 12,5 visiteurs/s (3 000 sur 240 s).
const r1 = Math.round(400 * ECH) || 1, r2 = Math.round(25 * ECH) || 1;

export const options = {
  scenarios: {
    visiteurs: {
      executor: 'ramping-arrival-rate',
      startRate: r1, timeUnit: '2s',
      preAllocatedVUs: Math.min(3000, Math.round(3000 * ECH) + 10),
      maxVUs: Math.max(20, Math.round(Number(__ENV.VU_MAX || 16000) * ECH)),
      stages: [
        { target: r1, duration: '60s' }, // 12 000 visiteurs
        { target: r2, duration: '1ms' },
        { target: r2, duration: '240s' }, // 3 000 visiteurs
      ],
      gracefulStop: '4m',
      exec: 'visiteur',
    },
    // Observe l'état du lien toutes les 500 ms : instant où il passe à « epuise » (T-07).
    sonde: { executor: 'constant-vus', vus: 1, duration: '5m', exec: 'sonde' },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    erreurs_5xx: ['count==0'],
    etat_connu: ['rate==1'],
    dropped_iterations: ['count==0'],
    'duree_demande': ['p(95)<2000'],
  },
};

const cEtat = {
  pret: new Counter('visiteurs_pret_telecharge'),
  epuise: new Counter('visiteurs_epuise'),
  abandon: new Counter('visiteurs_abandon_3min'),
  sans_etat: new Counter('visiteurs_sans_etat'),
};
const c429 = new Counter('reponses_429');
const cPatientez = new Counter('reponses_patientez');
const c5xx = new Counter('erreurs_5xx');
const etatConnu = new Rate('etat_connu');
const dureeDemande = new Trend('duree_demande', true);
const dureeFichier = new Trend('duree_fichier', true);
const tsEpuisePoller = new Trend('ts_epuise_sonde_ms');
const tsEpuiseAttente = new Trend('ts_epuise_recu_par_visiteur_en_attente_ms');

function compter5xx(r) { if (r.status >= 500) c5xx.add(1); }

export function visiteur() {
  const debut = Date.now();
  let aPatiente = false;
  for (;;) {
    const r = http.post(`${BASE}/api/liens/${LIEN}/demandes`, null, { tags: { nom: 'demandes' } });
    dureeDemande.add(r.timings.duration);
    compter5xx(r);
    let etat = null, corps = null;
    if (r.status === 429) { c429.add(1); etat = 'patientez'; aPatiente = true; }
    else if (r.status === 200) {
      try { corps = r.json(); etat = corps.etat; } catch (e) { etat = null; }
    }
    if (etat === 'pret') {
      const f = http.get(`${BASE}/api/liens/${LIEN}/fichier?ticket=${encodeURIComponent(corps.ticket)}`, { responseType: 'none', tags: { nom: 'fichier' } });
      dureeFichier.add(f.timings.duration);
      compter5xx(f);
      const ok = f.status === 200 && String(f.headers['Content-Type']).indexOf('pdf') >= 0;
      etatConnu.add(true);
      (ok ? cEtat.pret : cEtat.sans_etat).add(1);
      return;
    }
    if (etat === 'epuise') {
      etatConnu.add(true); cEtat.epuise.add(1);
      if (aPatiente) tsEpuiseAttente.add(Date.now());
      return;
    }
    if (etat === 'patientez') {
      if (r.status !== 429) cPatientez.add(1);
      aPatiente = true;
      if (Date.now() - debut >= MAX_ATTENTE_S * 1000) { etatConnu.add(true); cEtat.abandon.add(1); return; }
      sleep((corps && corps.reessayerDans) || 2);
      continue;
    }
    // Réponse inattendue (5xx, timeout, corps illisible) : on réessaie jusqu'à la limite, puis visiteur sans état.
    if (Date.now() - debut >= MAX_ATTENTE_S * 1000) { etatConnu.add(false); cEtat.sans_etat.add(1); return; }
    sleep(2);
  }
}

export function sonde() {
  const fin = Date.now() + 300000;
  while (Date.now() < fin) {
    const r = http.get(`${BASE}/api/liens/${LIEN}`, { tags: { nom: 'sonde' } });
    compter5xx(r);
    if (r.status === 200 && r.json().etat === 'epuise') { tsEpuisePoller.add(Date.now()); return; }
    sleep(0.5);
  }
}

// Résumé complet + délai épuisement -> réception de « epuise » (T-07).
export function handleSummary(data) {
  const m = data.metrics;
  const t0 = m.ts_epuise_sonde_ms && m.ts_epuise_sonde_ms.values.min;
  const att = m.ts_epuise_recu_par_visiteur_en_attente_ms;
  // Une tendance k6 n'a pas de « count » dans le résumé : on se fonde sur la présence de valeurs.
  const t07 = (t0 && att && att.values && att.values.max) ? {
    epuisementObserveMs: t0,
    delaiMedianMs: att.values.med - t0, delaiP95Ms: att.values['p(95)'] - t0, delaiMaxMs: att.values.max - t0,
    reussi: att.values.max - t0 < 5000,
  } : { note: 'épuisement non observé ou aucun visiteur en attente' };
  const sortie = {};
  sortie[__ENV.RESUME_JSON || 'resume-t06.json'] = JSON.stringify({ t07, metriques: m }, null, 2);
  sortie.stdout = `\nT-07 : ${JSON.stringify(t07)}\n`;
  return sortie;
}

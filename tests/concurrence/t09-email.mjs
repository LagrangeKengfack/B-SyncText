// T-09 (e-mail) : exactement un e-mail « lien épuisé », même quand on insiste après l'épuisement.
// Usage : BASE_URL=... EMAIL=<adresse vérifiée dans SES> node t09-email.mjs
import { api, creerSession, creerDocument, creerLien, ecrireResultat, exigerBaseUrl, idCourt, dormir } from './commun.mjs';
exigerBaseUrl();
const email = process.env.EMAIL;
if (!email) { console.error('EMAIL manquant (adresse vérifiée dans SES).'); process.exit(2); }

const run = idCourt();
const s = await creerSession('T09', email);
const docId = await creerDocument(s.jeton, `T-09 ${run}`);
const lienId = await creerLien(s.jeton, docId, 1);
const d1 = await api(`/api/liens/${lienId}/demandes`, { methode: 'POST' });
const f1 = await api(`/api/liens/${lienId}/fichier?ticket=${encodeURIComponent(d1.corps?.ticket ?? '')}`, { brut: true });
// On insiste : nouvelle demande, ticket rejoué, puis encore une demande.
const d2 = await api(`/api/liens/${lienId}/demandes`, { methode: 'POST' });
const f2 = await api(`/api/liens/${lienId}/fichier?ticket=${encodeURIComponent(d1.corps?.ticket ?? '')}`, { brut: true });
const d3 = await api(`/api/liens/${lienId}/demandes`, { methode: 'POST' });
await dormir(3000);
const liens = await api(`/api/documents/${docId}/liens`, { jeton: s.jeton });
const lien = liens.corps?.find((l) => l.lienId === lienId);
const ok = d1.corps?.etat === 'pret' && f1.statut === 200 && d2.corps?.etat === 'epuise' && f2.statut === 410 && d3.corps?.etat === 'epuise' && lien?.email === 'envoye';
ecrireResultat('t09-email', {
  lienId, email, premiereDemande: d1.corps?.etat, fichier: f1.statut, apresEpuisement: [d2.corps?.etat, f2.statut, d3.corps?.etat],
  etatEmail: lien?.email ?? null, erreurEmail: lien?.emailErreur ?? null,
  note: "Le nombre d'e-mails effectivement envoyés se lit dans les statistiques SES (aws ses get-send-statistics) : il doit augmenter de 1.",
  verdict: ok ? 'REUSSI' : 'ECHEC',
});
process.exit(ok ? 0 : 1);

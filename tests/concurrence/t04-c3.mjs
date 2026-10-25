// T-04 (C-3) : le PDF téléchargé reflète le document au moment du clic (marqueur + numéro de version).
// Usage : BASE_URL=... node t04-c3.mjs
import { ClientYjs, api, preparerDocument, creerLien, lirePdf, dormir, idCourt, ecrireResultat, exigerBaseUrl, options } from './commun.mjs';

const o = options({});
if (o.help) { console.log('Aucune option.'); process.exit(0); }
exigerBaseUrl();

const { docId, proprio } = await preparerDocument('t04', 0, 'T-04');
const lienId = await creerLien(proprio.jeton, docId, 3); // lien créé à T
const c = new ClientYjs({ docId, jeton: proprio.jeton, nom: 'proprio' });
await c.attendreSync();
c.preparerParagraphe();
await c.viderEnvoi();

async function telecharger() {
  const d = await api(`/api/liens/${lienId}/demandes`, { methode: 'POST' });
  if (d.corps?.etat !== 'pret') return { etat: d.corps?.etat ?? d.statut };
  const f = await api(`/api/liens/${lienId}/fichier?ticket=${encodeURIComponent(d.corps.ticket)}`, { brut: true });
  return { etat: 'pret', statut: f.statut, pdf: f.statut === 200 ? await lirePdf(f) : null };
}

const avant = await telecharger();
const marqueur = `[t04-${idCourt()}]`;
const accuse = await c.inserer(marqueur, 'fin');
await dormir(500);
const apres = await telecharger(); // utilisé à T1
c.fermer();

const sansAvant = avant.pdf ? !avant.pdf.texte.includes(marqueur) : null;
const avecApres = !!apres.pdf?.texte.includes(marqueur);
const versionApres = apres.pdf?.version ?? null;
const ok = accuse === 'ok' && avecApres && !!versionApres && sansAvant !== false;
ecrireResultat('t04-c3', {
  docId, lienId, marqueur, accuseInsertion: accuse,
  avant: { etat: avant.etat, version: avant.pdf?.version ?? null, contientMarqueur: avant.pdf ? !sansAvant : null },
  apres: { etat: apres.etat, version: versionApres, contientMarqueur: avecApres, extrait: apres.pdf?.texte.slice(-300) ?? null },
  verdict: ok ? 'REUSSI' : 'ECHEC',
});
process.exit(ok ? 0 : 1);

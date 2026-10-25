// PDF de base (pdfmake, polices standard du PDF) au gabarit « page de journal », puis tampon d'exemplaire (pdf-lib).
// Gabarit : documentation/conception/07-identite-et-interfaces.md §8 et assets/pdf-gabarit.svg.
import './prepa-pdfkit.js';
import pdfMake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces.js';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { Bloc, Segment } from '@b-synctext/commun';

// Polices standard du PDF : aucune police à embarquer.
const POLICES = {
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
  Times: { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' },
};
const NOMS_POLICES = new Set(Object.values(POLICES).flatMap((p) => Object.values(p)));
pdfMake.setFonts(POLICES);
// Aucun accès réseau ; « fichiers » locaux limités aux noms des polices standard.
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((chemin) => NOMS_POLICES.has(chemin));

// Géométrie : 1 mm = 2,8346 pt ; A4 = 595,28 × 841,89 pt.
const MM = 72 / 25.4;
const LARGEUR = 595.28;
const HAUTEUR = 841.89;
const MARGE_X = 25 * MM;
const MARGE_HAUT = 42 * MM;
const MARGE_BAS = 50 * MM;
const PIED_BAS = 36 * MM; // ligne de base du pied, depuis le bas
const LARGEUR_TEXTE = LARGEUR - 2 * MARGE_X;

const ORANGE = '#FC7C20';
const NOIR = '#292526';
const TEXTE = '#201A1B';
const ORANGE_TEXTE = '#A63F00';
const DOUX = '#6B6264';
const TAILLE_PIED = 10;

// Groupe « coin » du gabarit SVG (mm, origine en haut à gauche).
const COIN: { couleur: string; points: [number, number][] }[] = [
  { couleur: ORANGE, points: [[0, 0], [30, 0], [0, 50]] },
  { couleur: NOIR, points: [[36, 0], [130, 0], [114, 16], [26.4, 16]] },
  { couleur: ORANGE, points: [[40, 20], [104, 20], [98, 28], [34.4, 28]] },
  { couleur: ORANGE, points: [[140, 0], [210, 0], [210, 4], [138, 4]] },
  { couleur: NOIR, points: [[150, 9], [190, 9], [185, 15], [145, 15]] },
];

/** Bandes en biais : le coin en haut à gauche, puis tourné de 180° en bas à droite. */
function bandes(): Content {
  const polygones = COIN.flatMap(({ couleur, points }) =>
    [false, true].map((tourne) => ({
      type: 'polyline' as const,
      closePath: true,
      color: couleur,
      lineWidth: 0,
      points: points.map(([x, y]) => (tourne ? { x: (210 - x) * MM, y: (297 - y) * MM } : { x: x * MM, y: y * MM })),
    })),
  );
  return { canvas: polygones };
}

// Caractères hors WinAnsi (jeu des polices standard), remplacés par '?'.
const WIN_ANSI_EN_PLUS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function versWinAnsi(texte: string): string {
  let r = '';
  for (const c of texte) {
    const code = c.codePointAt(0)!;
    if (code === 10 || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EN_PLUS.includes(c)) r += c;
    else if (code === 9) r += ' ';
    else r += '?';
  }
  return r;
}

function texteDe(segments: Segment[]): { text: Content[] | string } {
  if (segments.length === 0) return { text: ' ' };
  return {
    text: segments.map((s) => ({
      text: versWinAnsi(s.texte),
      bold: s.gras,
      italics: s.italique,
      ...(s.souligne ? { decoration: 'underline' as const } : {}),
    })),
  };
}

// Coupe un texte en lignes d'au plus `largeur` (mots trop longs coupés au caractère).
function couper(texte: string, police: PDFFont, taille: number, largeur: number): string[] {
  const lignes: string[] = [];
  let ligne = '';
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (police.widthOfTextAtSize(essai, taille) <= largeur) { ligne = essai; continue; }
    if (ligne) lignes.push(ligne);
    ligne = '';
    for (const c of mot) {
      if (police.widthOfTextAtSize(ligne + c, taille) > largeur && ligne) { lignes.push(ligne); ligne = ''; }
      ligne += c;
    }
  }
  if (ligne || lignes.length === 0) lignes.push(ligne);
  return lignes;
}

// Ramène à `max` lignes, la dernière terminée par « … ».
function limiter(lignes: string[], max: number, police: PDFFont, taille: number, largeur: number): string[] {
  if (lignes.length <= max) return lignes;
  const garde = lignes.slice(0, max);
  let derniere = garde[max - 1]!;
  while (derniere && police.widthOfTextAtSize(`${derniere}…`, taille) > largeur) derniere = derniere.slice(0, -1);
  garde[max - 1] = `${derniere.trimEnd()}…`;
  return garde;
}

// Mesure des polices standard (pdf-lib, sans PDF à produire).
interface Mesures { times: PDFFont; timesGras: PDFFont }
let mesures: Promise<Mesures> | undefined;
function lireMesures(): Promise<Mesures> {
  mesures ??= (async () => {
    const doc = await PDFDocument.create();
    return { times: await doc.embedFont(StandardFonts.TimesRoman), timesGras: await doc.embedFont(StandardFonts.TimesRomanBold) };
  })();
  return mesures;
}

// En-tête (positions fixes, en pt depuis le haut de la page).
const TAILLE_TITRE_DOC = 20;
const PAS_TITRE_DOC = 23;
const MAX_LIGNES_TITRE = 2;

/** En-tête de page : association, titre, version, filet. Renvoie le contenu et la marge haute résultante. */
function entetePage(lignesTitre: string[], version: string): { contenu: Content[]; margeHaut: number } {
  let y = MARGE_HAUT;
  const contenu: Content[] = [
    { text: 'B-SYNCTEXT', font: 'Helvetica', bold: true, fontSize: 7.5, characterSpacing: 1.6, color: ORANGE_TEXTE, absolutePosition: { x: MARGE_X, y } },
  ];
  y += 15;
  for (const ligne of lignesTitre) {
    contenu.push({ text: ligne, font: 'Times', bold: true, fontSize: TAILLE_TITRE_DOC, lineHeight: 1, color: TEXTE, absolutePosition: { x: MARGE_X, y } });
    y += PAS_TITRE_DOC;
  }
  y += 3;
  contenu.push({ text: version, font: 'Helvetica', bold: true, fontSize: 8.5, color: DOUX, absolutePosition: { x: MARGE_X, y } });
  y += 17;
  contenu.push({ canvas: [{ type: 'line', x1: MARGE_X, y1: y, x2: LARGEUR - MARGE_X, y2: y, lineWidth: 1.5, lineColor: NOIR }], absolutePosition: { x: 0, y: 0 } });
  return { contenu, margeHaut: y + 16 };
}

const TAILLE_TITRE: Record<number, number> = { 1: 17, 2: 14.5, 3: 12.5 };
const RETRAIT = 18;

function corps(blocs: Bloc[]): Content[] {
  const contenu: Content[] = [];
  for (const b of blocs) {
    const t = texteDe(b.type === 'titre' ? b.segments.map((s) => ({ ...s, gras: true })) : b.segments);
    if (b.type === 'titre') {
      contenu.push({ ...t, bold: true, fontSize: TAILLE_TITRE[b.niveau] ?? 12.5, lineHeight: 1.15, alignment: b.alignement, margin: [0, 12, 0, 5], headlineLevel: 1 } as Content);
    } else if (b.type === 'paragraphe') {
      contenu.push({ ...t, alignment: b.alignement, margin: [0, 0, 0, 7] } as Content);
    } else {
      const marque = b.suite ? '' : b.type === 'puce' ? '•' : `${b.numero ?? 1}.`;
      contenu.push({
        columns: [
          { width: RETRAIT, text: marque },
          { width: '*', ...t, alignment: b.alignement },
        ],
        columnGap: 0,
        margin: [(Math.max(1, b.niveau) - 1) * RETRAIT + 4, 0, 0, 4],
      } as Content);
    }
  }
  return contenu;
}

/** PDF de base d'une version (sans numéro d'exemplaire), au gabarit du §8. */
export async function genererPdf(blocs: Bloc[], entete: { titre: string; numeroVersion: string }): Promise<Uint8Array> {
  const { times, timesGras } = await lireMesures();
  const titre = versWinAnsi(entete.titre).replace(/\s+/g, ' ').trim() || 'Sans titre';
  const version = versWinAnsi(`Version ${entete.numeroVersion}`);
  const lignesTitre = limiter(couper(titre, timesGras, TAILLE_TITRE_DOC, LARGEUR_TEXTE), MAX_LIGNES_TITRE, timesGras, TAILLE_TITRE_DOC, LARGEUR_TEXTE);
  const { contenu: tete, margeHaut } = entetePage(lignesTitre, version);
  const xVersion = LARGEUR - MARGE_X - times.widthOfTextAtSize(version, TAILLE_PIED);
  // pdfmake place le haut de la ligne : on remonte de l'ascendante pour poser la ligne de base à 36 mm.
  const ascendante = (taille: number) => times.heightAtSize(taille, { descender: false });
  const yPied = HAUTEUR - PIED_BAS - ascendante(TAILLE_PIED);

  const definition: TDocumentDefinitions = {
    info: { title: titre, creator: 'B-SyncText', producer: 'B-SyncText' },
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGE_X, margeHaut, MARGE_X, MARGE_BAS],
    defaultStyle: { font: 'Times', fontSize: 11, lineHeight: 1.3, color: TEXTE },
    background: () => [
      bandes(),
      ...tete,
      // Filet fin au-dessus du pied.
      { canvas: [{ type: 'line', x1: MARGE_X, y1: yPied - 9, x2: LARGEUR - MARGE_X, y2: yPied - 9, lineWidth: 0.5, lineColor: '#D9D2CF' }], absolutePosition: { x: 0, y: 0 } },
      { text: version, font: 'Times', fontSize: TAILLE_PIED, lineHeight: 1, color: NOIR, absolutePosition: { x: xVersion, y: yPied } },
    ],
    // Numéro de page centré, sur la ligne du pied (le pied pdfmake commence au bas de la zone de texte).
    footer: (page, total) => ({
      text: `${page} / ${total}`,
      font: 'Times', fontSize: 8, lineHeight: 1, color: DOUX, alignment: 'center',
      margin: [MARGE_X, yPied + ascendante(TAILLE_PIED) - ascendante(8) - (HAUTEUR - MARGE_BAS), MARGE_X, 0],
    }),
    content: corps(blocs),
    // Un titre de section ne reste pas seul en bas de page.
    pageBreakBefore: (noeud, suivants) =>
      (noeud as { headlineLevel?: number }).headlineLevel === 1 && suivants.getFollowingNodesOnPage().length === 0,
  };
  return new Uint8Array(await pdfMake.createPdf(definition).getBuffer());
}

/** Ajoute « Exemplaire k / N » en bas à gauche de chaque page (25 mm du bord, 36 mm du bas). */
export async function tamponner(pdf: Uint8Array, exemplaire: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const police = await doc.embedFont(StandardFonts.TimesRoman);
  const texte = versWinAnsi(exemplaire);
  for (const page of doc.getPages()) {
    page.drawText(texte, { x: MARGE_X, y: PIED_BAS, size: TAILLE_PIED, font: police, color: rgb(0x29 / 255, 0x25 / 255, 0x26 / 255) });
  }
  return doc.save();
}

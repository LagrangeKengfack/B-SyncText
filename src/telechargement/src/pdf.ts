// Génération du PDF de base (pdfmake, polices standard du PDF) et tampon par exemplaire (pdf-lib).
import './prepa-pdfkit.js';
import pdfMake from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

const MARGE = 56;

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

function texteDe(segments: Segment[]): Content {
  if (segments.length === 0) return { text: ' ' };
  return {
    text: segments.map((s) => ({
      text: versWinAnsi(s.texte),
      bold: s.gras,
      italics: s.italique,
      ...(s.souligne ? { decoration: 'underline' as const } : {}),
    })),
  };
}

const TAILLE_TITRE: Record<number, number> = { 1: 20, 2: 16, 3: 13 };

/** Définition pdfmake d'un document à partir des blocs neutres. */
export function definitionPdf(titre: string, blocs: Bloc[]): TDocumentDefinitions {
  const contenu: Content[] = [
    { text: versWinAnsi(titre), font: 'Helvetica', bold: true, fontSize: 22, margin: [0, 0, 0, 16] },
  ];
  for (const b of blocs) {
    const t = texteDe(b.segments) as { text: unknown };
    if (b.type === 'titre') {
      contenu.push({ ...t, font: 'Helvetica', bold: true, fontSize: TAILLE_TITRE[b.niveau] ?? 13, alignment: b.alignement, margin: [0, 10, 0, 6] } as Content);
    } else if (b.type === 'paragraphe') {
      contenu.push({ ...t, alignment: b.alignement, margin: [0, 0, 0, 6] } as Content);
    } else {
      const marque = b.suite ? '' : b.type === 'puce' ? '•' : `${b.numero ?? 1}.`;
      contenu.push({
        columns: [
          { width: 18, text: marque },
          { width: '*', ...t, alignment: b.alignement },
        ],
        columnGap: 2,
        margin: [(b.niveau - 1) * 18, 0, 0, 4],
      } as Content);
    }
  }
  return {
    info: { title: versWinAnsi(titre), creator: 'B-SyncText' },
    pageSize: 'A4',
    pageMargins: [MARGE, MARGE, MARGE, MARGE + 16],
    defaultStyle: { font: 'Times', fontSize: 11, lineHeight: 1.25 },
    content: contenu,
  };
}

/** PDF de base (sans numéro d'exemplaire). */
export async function genererPdfBase(titre: string, blocs: Bloc[]): Promise<Uint8Array> {
  return new Uint8Array(await pdfMake.createPdf(definitionPdf(titre, blocs)).getBuffer());
}

/** Ajoute le pied de page de l'exemplaire sur chaque page. */
export async function tamponner(pdfBase: Uint8Array, pied: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBase);
  const police = await pdf.embedFont(StandardFonts.Helvetica);
  const texte = versWinAnsi(pied);
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    page.drawText(texte, { x: MARGE, y: 30, size: 8, font: police, color: rgb(0.35, 0.35, 0.35) });
    const numero = `${i + 1} / ${pages.length}`;
    const largeur = police.widthOfTextAtSize(numero, 8);
    page.drawText(numero, { x: page.getWidth() - MARGE - largeur, y: 30, size: 8, font: police, color: rgb(0.35, 0.35, 0.35) });
  });
  return pdf.save();
}

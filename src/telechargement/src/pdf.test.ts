import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { extractText } from 'unpdf';
import type { Bloc } from '@b-synctext/commun';
import { genererPdf, tamponner, versWinAnsi } from './pdf.js';
import { libelleExemplaire } from './regles.js';

const seg = (texte: string, m: Partial<{ gras: boolean; italique: boolean; souligne: boolean }> = {}) =>
  ({ texte, gras: false, italique: false, souligne: false, ...m });

const blocs: Bloc[] = [
  { type: 'titre', niveau: 1, alignement: 'center', segments: [seg('Chapitre premier')] },
  { type: 'paragraphe', niveau: 0, alignement: 'justify', segments: [seg('Texte '), seg('gras', { gras: true }), seg(' souligné', { souligne: true, italique: true })] },
  { type: 'paragraphe', niveau: 0, alignement: 'left', segments: [] },
  { type: 'titre', niveau: 2, alignement: 'left', segments: [seg('Section')] },
  { type: 'puce', niveau: 1, alignement: 'left', segments: [seg('puce')] },
  { type: 'numero', niveau: 2, alignement: 'left', segments: [seg('numéro')], numero: 3 },
  { type: 'puce', niveau: 1, alignement: 'left', segments: [seg('suite')], suite: true },
  { type: 'paragraphe', niveau: 0, alignement: 'right', segments: [seg('à droite')] },
  { type: 'titre', niveau: 3, alignement: 'center', segments: [seg('Sous-section')] },
  ...Array.from({ length: 60 }, (_, i): Bloc => ({ type: 'paragraphe', niveau: 0, alignement: 'left', segments: [seg(`Ligne ${i} 🙂`)] })),
];

// Texte de chaque page, espaces normalisés.
async function pages(pdf: Uint8Array): Promise<string[]> {
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: false });
  return text.map((t) => t.replace(/\s+/g, ' '));
}

describe('PDF', () => {
  it('génère le PDF de base avec en-tête et version sur chaque page, sans date', async () => {
    const base = await genererPdf(blocs, { titre: 'Bulletin « été »', numeroVersion: 'v1.2' });
    expect(Buffer.from(base.slice(0, 5)).toString()).toBe('%PDF-');
    const textes = await pages(base);
    expect(textes.length).toBeGreaterThanOrEqual(2);
    for (const t of textes) {
      expect(t.replace(/ /g, '')).toContain('B-SYNCTEXT');
      expect(t).toContain('Bulletin « été »');
      expect(t).toContain('Version v1.2');
      expect(t).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}:\d{2}/);
      expect(t).not.toContain('Exemplaire');
    }
    expect(textes[0]).toContain('Chapitre premier');
    expect(textes[0]).toContain('numéro');
    expect(textes[0]).toContain('Ligne 0 ?');
  });

  it('tamponne chaque page sans changer le nombre de pages', async () => {
    const base = await genererPdf(blocs.slice(0, 40), { titre: 'Doc', numeroVersion: 'v1.2' });
    const tamponne = await tamponner(base, libelleExemplaire(3, 10));
    const nbBase = (await PDFDocument.load(base)).getPageCount();
    expect(nbBase).toBe(2);
    expect((await PDFDocument.load(tamponne)).getPageCount()).toBe(nbBase);
    const textes = await pages(tamponne);
    for (const t of textes) {
      expect(t).toContain('Exemplaire 3 / 10');
      expect(t).toContain('Version v1.2');
      expect(t).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}:\d{2}/);
    }
  });

  it('accepte un document vide et un titre très long', async () => {
    const base = await genererPdf([], { titre: 'Un titre '.repeat(40), numeroVersion: 'v0.1' });
    expect((await PDFDocument.load(base)).getPageCount()).toBe(1);
    expect((await pages(base))[0]).toContain('…');
  });

  it('remplace les caractères hors WinAnsi', () => {
    expect(versWinAnsi('été € 🙂 → \t')).toBe('été € ? ?  ');
  });
});

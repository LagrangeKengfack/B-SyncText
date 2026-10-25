import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { Bloc } from '@b-synctext/commun';
import { genererPdfBase, tamponner, versWinAnsi } from './pdf.js';

const seg = (texte: string, m: Partial<{ gras: boolean; italique: boolean; souligne: boolean }> = {}) =>
  ({ texte, gras: false, italique: false, souligne: false, ...m });

const blocs: Bloc[] = [
  { type: 'titre', niveau: 1, alignement: 'center', segments: [seg('Chapitre')] },
  { type: 'paragraphe', niveau: 0, alignement: 'justify', segments: [seg('Texte '), seg('gras', { gras: true }), seg(' souligné', { souligne: true, italique: true })] },
  { type: 'paragraphe', niveau: 0, alignement: 'left', segments: [] },
  { type: 'puce', niveau: 1, alignement: 'left', segments: [seg('puce')] },
  { type: 'numero', niveau: 2, alignement: 'left', segments: [seg('numéro')], numero: 3 },
  { type: 'puce', niveau: 1, alignement: 'left', segments: [seg('suite')], suite: true },
  ...Array.from({ length: 120 }, (_, i): Bloc => ({ type: 'paragraphe', niveau: 0, alignement: 'left', segments: [seg(`Ligne ${i} 🙂`)] })),
];

describe('PDF', () => {
  it('génère un PDF de base puis le tamponne sur chaque page', async () => {
    const base = await genererPdfBase('Titre « été »', blocs);
    expect(Buffer.from(base.slice(0, 5)).toString()).toBe('%PDF-');
    const tamponne = await tamponner(base, 'Exemplaire 1 / 2 · version v0.1 · généré le 25/10/2026 12:00 (WAT)');
    const lu = await PDFDocument.load(tamponne);
    expect(lu.getPageCount()).toBeGreaterThan(1);
    expect(lu.getPageCount()).toBe((await PDFDocument.load(base)).getPageCount());
  });
  it('remplace les caractères hors WinAnsi', () => {
    expect(versWinAnsi('été € 🙂 → \t')).toBe('été € ? ?  ');
  });
});

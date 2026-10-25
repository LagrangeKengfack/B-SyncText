import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { compterCaracteresInseres, longueurTexte, yjsVersBlocs } from './yjs.js';

// Capture la mise à jour produite par une modification.
function majDe(doc: Y.Doc, modif: () => void): Uint8Array {
  let maj: Uint8Array | null = null;
  const f = (u: Uint8Array) => { maj = u; };
  doc.on('update', f);
  doc.transact(modif);
  doc.off('update', f);
  if (!maj) throw new Error('aucune mise à jour');
  return maj;
}

function docAvecParagraphe(): { doc: Y.Doc; texte: Y.XmlText; para: Y.XmlElement } {
  const doc = new Y.Doc();
  const para = new Y.XmlElement('paragraph');
  const texte = new Y.XmlText();
  doc.getXmlFragment('default').insert(0, [para]);
  para.insert(0, [texte]);
  return { doc, texte, para };
}

describe('compterCaracteresInseres', () => {
  it('compte le texte inséré', () => {
    const { doc, texte } = docAvecParagraphe();
    expect(compterCaracteresInseres(majDe(doc, () => texte.insert(0, 'Bonjour')))).toBe(7);
  });

  it('compte le texte inséré avec une marque', () => {
    const { doc, texte } = docAvecParagraphe();
    const maj = majDe(doc, () => texte.insert(0, 'gras', { bold: {} }));
    expect(compterCaracteresInseres(maj)).toBe(4);
  });

  it('la mise en forme seule compte 0', () => {
    const { doc, texte } = docAvecParagraphe();
    texte.insert(0, 'Bonjour le monde');
    expect(compterCaracteresInseres(majDe(doc, () => texte.format(0, 7, { bold: {} })))).toBe(0);
    expect(compterCaracteresInseres(majDe(doc, () => texte.format(0, 7, { italic: {}, underline: {} })))).toBe(0);
  });

  it('une suppression compte 0', () => {
    const { doc, texte } = docAvecParagraphe();
    texte.insert(0, 'Bonjour le monde');
    expect(compterCaracteresInseres(majDe(doc, () => texte.delete(0, 8)))).toBe(0);
  });

  it('un nouveau paragraphe vide compte 0, avec du texte compte le texte', () => {
    const { doc } = docAvecParagraphe();
    const frag = doc.getXmlFragment('default');
    expect(compterCaracteresInseres(majDe(doc, () => {
      const p = new Y.XmlElement('paragraph');
      frag.insert(1, [p]);
      p.insert(0, [new Y.XmlText()]);
    }))).toBe(0);
    expect(compterCaracteresInseres(majDe(doc, () => {
      const p = new Y.XmlElement('paragraph');
      frag.insert(2, [p]);
      p.insert(0, [new Y.XmlText('abc')]);
    }))).toBe(3);
  });

  it('un attribut de bloc (alignement, titre) compte 0', () => {
    const { doc, para } = docAvecParagraphe();
    expect(compterCaracteresInseres(majDe(doc, () => para.setAttribute('textAlign', 'center')))).toBe(0);
  });

  it('compte en unités UTF-16 et les accents comme un caractère', () => {
    const { doc, texte } = docAvecParagraphe();
    expect(compterCaracteresInseres(majDe(doc, () => texte.insert(0, 'été')))).toBe(3);
  });

  it("l'état complet compte tout ; avec le vecteur d'état seul le nouveau compte", () => {
    const { doc, texte } = docAvecParagraphe();
    texte.insert(0, 'abcde');
    const vecteur = Y.encodeStateVector(doc);
    texte.insert(5, 'XY');
    const complet = Y.encodeStateAsUpdate(doc);
    expect(compterCaracteresInseres(complet)).toBe(7);
    expect(compterCaracteresInseres(complet, vecteur)).toBe(2);
  });

  it('frappe en plusieurs mises à jour fusionnées', () => {
    const { doc, texte } = docAvecParagraphe();
    const m1 = majDe(doc, () => texte.insert(0, 'ab'));
    const m2 = majDe(doc, () => texte.insert(2, 'cd'));
    expect(compterCaracteresInseres(Y.mergeUpdates([m1, m2]))).toBe(4);
  });
});

describe('yjsVersBlocs (document Tiptap réel)', () => {
  const schema = getSchema([StarterKit, TextAlign.configure({ types: ['heading', 'paragraph'] })]);
  const json = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Titre' }] },
      {
        type: 'paragraph',
        attrs: { textAlign: 'justify' },
        content: [
          { type: 'text', text: 'Un ' },
          { type: 'text', text: 'gras', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' et ' },
          { type: 'text', text: 'tout', marks: [{ type: 'italic' }, { type: 'underline' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'fin' },
        ],
      },
      { type: 'paragraph' },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'puce 1' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'suite' }] },
            { type: 'orderedList', attrs: { start: 3 }, content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'trois' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quatre' }] }] },
            ] },
          ] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'puce 2' }] }] },
        ],
      },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cité' }] }] },
    ],
  };
  const doc = new Y.Doc();
  prosemirrorJSONToYXmlFragment(schema, json, doc.getXmlFragment('default'));
  const blocs = yjsVersBlocs(doc);

  it('titre avec niveau et alignement', () => {
    expect(blocs[0]).toMatchObject({ type: 'titre', niveau: 2, alignement: 'center' });
    expect(blocs[0]!.segments.map((s) => s.texte).join('')).toBe('Titre');
  });

  it('paragraphe avec marques et saut de ligne', () => {
    const p = blocs[1]!;
    expect(p).toMatchObject({ type: 'paragraphe', alignement: 'justify' });
    expect(p.segments).toEqual([
      { texte: 'Un ', gras: false, italique: false, souligne: false },
      { texte: 'gras', gras: true, italique: false, souligne: false },
      { texte: ' et ', gras: false, italique: false, souligne: false },
      { texte: 'tout', gras: false, italique: true, souligne: true },
      { texte: '\n', gras: false, italique: false, souligne: false },
      { texte: 'fin', gras: false, italique: false, souligne: false },
    ]);
  });

  it('paragraphe vide', () => {
    expect(blocs[2]).toEqual({ type: 'paragraphe', niveau: 0, alignement: 'left', segments: [] });
  });

  it('listes imbriquées', () => {
    expect(blocs.slice(3, 8).map((b) => [b.type, b.niveau, b.numero, b.suite, b.segments[0]?.texte])).toEqual([
      ['puce', 1, undefined, undefined, 'puce 1'],
      ['puce', 1, undefined, true, 'suite'],
      ['numero', 2, 3, undefined, 'trois'],
      ['numero', 2, 4, undefined, 'quatre'],
      ['puce', 1, undefined, undefined, 'puce 2'],
    ]);
  });

  it('conteneur inconnu : contenu lu', () => {
    expect(blocs[8]).toMatchObject({ type: 'paragraphe', segments: [{ texte: 'cité' }] });
    expect(blocs).toHaveLength(9);
  });

  it('longueurTexte', () => {
    expect(longueurTexte(doc)).toBe('Titre'.length + 'Un gras et tout\nfin'.length + 'puce 1suitetroisquatrepuce 2cité'.length);
  });

  it('document vide', () => {
    expect(yjsVersBlocs(new Y.Doc())).toEqual([]);
  });
});

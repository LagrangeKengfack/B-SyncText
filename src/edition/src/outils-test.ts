// Aides Yjs pour les tests (non compilées dans dist).
import * as Y from 'yjs';

/** Mise à jour produite par une modification locale. */
export function majDe(doc: Y.Doc, modif: () => void): Uint8Array {
  const recues: Uint8Array[] = [];
  const f = (u: Uint8Array) => recues.push(u);
  doc.on('update', f);
  doc.transact(modif);
  doc.off('update', f);
  if (recues.length === 0) throw new Error('aucune mise à jour');
  return Y.mergeUpdates(recues);
}

/** Texte brut du premier paragraphe (ou de tous). */
export function texte(doc: Y.Doc): string {
  return doc
    .getXmlFragment('default')
    .toArray()
    .map((n) => (n instanceof Y.XmlElement ? n.toArray().map((t) => (t instanceof Y.XmlText ? t.toString() : '')).join('') : ''))
    .join('\n');
}

/** Document avec un paragraphe vide, prêt à écrire. */
export function docInitial(): Y.Doc {
  const doc = new Y.Doc();
  const para = new Y.XmlElement('paragraph');
  doc.getXmlFragment('default').insert(0, [para]);
  para.insert(0, [new Y.XmlText()]);
  return doc;
}

export function zoneTexte(doc: Y.Doc): Y.XmlText {
  const para = doc.getXmlFragment('default').get(0) as Y.XmlElement;
  return para.get(0) as Y.XmlText;
}

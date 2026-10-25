// Outils Yjs : comptage du crédit et conversion du document en blocs neutres.
import * as Y from 'yjs';

/**
 * Nombre de caractères insérés par une mise à jour Yjs (v1).
 * Seuls les `Item` à contenu `ContentString` comptent (longueur en unités UTF-16,
 * comme `string.length` côté navigateur) ; éléments, mise en forme et suppressions comptent 0.
 * Si `vecteurEtat` (état connu du serveur) est fourni, on ne compte que ce qui est nouveau,
 * utile pour un SyncStep2 qui renvoie aussi du contenu déjà accepté.
 */
export function compterCaracteresInseres(maj: Uint8Array, vecteurEtat?: Uint8Array): number {
  const utile = vecteurEtat ? Y.diffUpdate(maj, vecteurEtat) : maj;
  let total = 0;
  for (const s of Y.decodeUpdate(utile).structs) {
    if (s instanceof Y.Item && s.content instanceof Y.ContentString) total += s.content.str.length;
  }
  return total;
}

export type Alignement = 'left' | 'center' | 'right' | 'justify';

export interface Segment {
  texte: string;
  gras: boolean;
  italique: boolean;
  souligne: boolean;
}

/**
 * Bloc d'une structure plate, lue dans l'ordre :
 * - `paragraphe` (niveau 0) ; `titre` (niveau 1 à 3) ;
 * - `puce` / `numero` : élément de liste, niveau = profondeur (1 = premier niveau),
 *   `numero` = rang dans la liste numérotée ; `suite` = paragraphe suivant du même élément (sans marque).
 */
export interface Bloc {
  type: 'paragraphe' | 'titre' | 'puce' | 'numero';
  niveau: number;
  alignement: Alignement;
  segments: Segment[];
  numero?: number;
  suite?: boolean;
}

const ALIGNEMENTS: readonly string[] = ['left', 'center', 'right', 'justify'];

function alignementDe(el: Y.XmlElement): Alignement {
  const a = el.getAttribute('textAlign') as unknown;
  return typeof a === 'string' && ALIGNEMENTS.includes(a) ? (a as Alignement) : 'left';
}

/** Segments d'un nœud de texte (paragraphe, titre…). */
function segmentsDe(el: Y.XmlElement): Segment[] {
  const segments: Segment[] = [];
  for (const enfant of el.toArray()) {
    if (enfant instanceof Y.XmlText) {
      for (const d of enfant.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
        if (typeof d.insert !== 'string') continue;
        const a = d.attributes ?? {};
        segments.push({ texte: d.insert, gras: a.bold != null, italique: a.italic != null, souligne: a.underline != null });
      }
    } else if (enfant instanceof Y.XmlElement && enfant.nodeName === 'hardBreak') {
      segments.push({ texte: '\n', gras: false, italique: false, souligne: false });
    } else if (enfant instanceof Y.XmlElement) {
      segments.push(...segmentsDe(enfant));
    }
  }
  return segments;
}

function contientTexte(el: Y.XmlElement): boolean {
  return el.toArray().some((e) => e instanceof Y.XmlText || (e instanceof Y.XmlElement && e.nodeName === 'hardBreak'));
}

interface Contexte {
  type: 'puce' | 'numero';
  niveau: number;
  numero?: number;
  premier: boolean;
}

function parcourir(el: Y.XmlElement, blocs: Bloc[], ctx: Contexte | null): void {
  const nom = el.nodeName;
  if (nom === 'bulletList' || nom === 'orderedList') {
    const niveau = (ctx?.niveau ?? 0) + 1;
    const debut = Number(el.getAttribute('start') ?? 1) || 1;
    let rang = 0;
    for (const item of el.toArray()) {
      if (!(item instanceof Y.XmlElement)) continue;
      const sous: Contexte = nom === 'orderedList'
        ? { type: 'numero', niveau, numero: debut + rang, premier: true }
        : { type: 'puce', niveau, premier: true };
      rang++;
      for (const enfant of item.toArray()) {
        if (enfant instanceof Y.XmlElement) parcourir(enfant, blocs, sous);
      }
    }
    return;
  }
  if (nom === 'heading' || nom === 'paragraph' || contientTexte(el) || el.length === 0) {
    const segments = segmentsDe(el);
    const alignement = alignementDe(el);
    if (ctx) {
      const bloc: Bloc = { type: ctx.type, niveau: ctx.niveau, alignement, segments };
      if (ctx.numero !== undefined) bloc.numero = ctx.numero;
      if (!ctx.premier) bloc.suite = true;
      ctx.premier = false;
      blocs.push(bloc);
    } else if (nom === 'heading') {
      const niveau = Math.min(3, Math.max(1, Number(el.getAttribute('level') ?? 1) || 1));
      blocs.push({ type: 'titre', niveau, alignement, segments });
    } else {
      blocs.push({ type: 'paragraphe', niveau: 0, alignement, segments });
    }
    return;
  }
  // Nœud conteneur inconnu (citation…) : on lit ses enfants.
  for (const enfant of el.toArray()) {
    if (enfant instanceof Y.XmlElement) parcourir(enfant, blocs, ctx);
  }
}

/** Convertit le fragment Tiptap `default` d'un Y.Doc en blocs neutres (pour le PDF). */
export function yjsVersBlocs(ydoc: Y.Doc, nomFragment = 'default'): Bloc[] {
  const blocs: Bloc[] = [];
  for (const enfant of ydoc.getXmlFragment(nomFragment).toArray()) {
    if (enfant instanceof Y.XmlElement) parcourir(enfant, blocs, null);
  }
  return blocs;
}

/** Nombre de caractères du texte d'un document (contrôle de TAILLE_MAX_DOCUMENT). */
export function longueurTexte(ydoc: Y.Doc, nomFragment = 'default'): number {
  let total = 0;
  for (const b of yjsVersBlocs(ydoc, nomFragment)) for (const s of b.segments) total += s.texte.length;
  return total;
}

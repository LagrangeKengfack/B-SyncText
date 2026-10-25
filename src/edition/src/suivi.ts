// État en mémoire d'un document ouvert : journal en cours, activité, verrou des tâches lourdes.
import { longueurTexte } from '@b-synctext/commun';
import type * as Y from 'yjs';

export class SuiviDocument {
  /** Dernier seq écrit dans le journal (ou de l'état chargé). */
  dernierSeq?: string;
  /** Entrées écrites (ou en cours d'écriture) mais pas encore appliquées au document. */
  readonly enCours = new Set<string>();

  modifieDepuisCompactage = false;
  derniereCompactage: number;
  modifieDepuisVersion = false;
  derniereVersionAuto: number;
  /** Dernière modification acceptée (ms) : une version automatique part après un délai de calme. */
  derniereModification = 0;
  auteursDepuisVersion = new Set<string>();
  modifieDepuisPresence = false;

  private longueur?: number;
  private file: Promise<unknown> = Promise.resolve();

  constructor(maintenant: number, dernierSeq?: string) {
    this.derniereCompactage = maintenant;
    this.derniereVersionAuto = maintenant;
    this.dernierSeq = dernierSeq;
  }

  /** Une écriture du journal commence : le seq reste « en cours » jusqu'à l'application. */
  debutEcriture(seq: string): void {
    this.enCours.add(seq);
  }

  /** L'entrée est acceptée (écrite) : on note l'activité. */
  noterAcceptee(seq: string, auteur: string, maintenant = Date.now()): void {
    this.derniereModification = maintenant;
    if (!this.dernierSeq || seq > this.dernierSeq) this.dernierSeq = seq;
    this.modifieDepuisCompactage = true;
    this.modifieDepuisVersion = true;
    this.modifieDepuisPresence = true;
    this.auteursDepuisVersion.add(auteur);
  }

  finEcriture(seq: string): void {
    this.enCours.delete(seq);
  }

  /**
   * seq à inscrire sur un état compacté pris maintenant : le dernier seq connu,
   * ou le plus ancien seq encore en cours (pas encore dans l'état), pour qu'il soit relu.
   */
  seqEtat(): string {
    let seq = this.dernierSeq;
    for (const s of this.enCours) if (!seq || s < seq) seq = s;
    return seq ?? '0'.repeat(13);
  }

  invaliderLongueur(): void {
    this.longueur = undefined;
  }

  /** Longueur du texte, recalculée seulement après une modification. */
  longueurTexte(ydoc: Y.Doc): number {
    this.longueur ??= longueurTexte(ydoc);
    return this.longueur;
  }

  /** Exécute les tâches lourdes (compactage, versions, restauration) une par une. */
  executerSeul<T>(tache: () => Promise<T>): Promise<T> {
    const suite = this.file.then(tache, tache);
    this.file = suite.catch(() => undefined);
    return suite;
  }
}

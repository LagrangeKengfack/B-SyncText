// Contrôle d'une mise à jour entrante AVANT son application (C-2, C-4, H-04).
// Ordre : doublon ? → taille → crédit (débit conditionnel) → journal (attendu) → acceptée.
import { compterCaracteresInseres, jourWat, nouveauSeq, TAILLE_MAX_DOCUMENT } from '@b-synctext/commun';
import * as Y from 'yjs';

/**
 * Vrai si tout le contenu de la mise à jour est déjà dans le document (renvoi après reconnexion).
 * Compare les horloges des structures au vecteur d'état : coût proportionnel à la mise à jour,
 * pas au document (un instantané Yjs par message saturait le processeur à 300 rédacteurs).
 */
function dejaConnue(ydoc: Y.Doc, maj: Uint8Array): boolean {
  const { structs } = Y.decodeUpdate(maj);
  if (structs.length === 0) return false;
  const vecteur = Y.decodeStateVector(Y.encodeStateVector(ydoc));
  return structs.every((s) => (vecteur.get(s.id.client) ?? 0) >= s.id.clock + s.length);
}
import { debiterCredit, lireCredit, rembourserCredit } from './credit.js';
import type { Dependances } from './dependances.js';
import { ecrireJournal } from './persistance.js';
import type { SuiviDocument } from './suivi.js';

/** Au-delà, une mise à jour ne tient pas dans un élément DynamoDB (400 Ko). */
export const TAILLE_MAX_MAJ_OCTETS = 350_000;

export type RaisonRefus = 'credit' | 'taille' | 'bloque';

export type ResultatControle =
  | { decision: 'ignoree' }
  | { decision: 'acceptee'; seq: string; caracteres: number; restant?: number; rechargeA?: number }
  | { decision: 'refusee'; raison: RaisonRefus; restant?: number; rechargeA?: number; bloqueJusqua?: number };

export interface DemandeControle {
  docId: string;
  ydoc: Y.Doc;
  maj: Uint8Array;
  email: string;
  /** Fin de blocage connue pour ce rédacteur. */
  bloqueJusqua?: number;
  suivi: SuiviDocument;
}

export async function controlerMiseAJour(d: Dependances, q: DemandeControle): Promise<ResultatControle> {
  const m = d.maintenant();

  // Rien de nouveau (ex. SyncStep2 vide à la reconnexion) : pas de journal, pas de débit.
  if (dejaConnue(q.ydoc, q.maj)) return { decision: 'ignoree' };

  if (q.bloqueJusqua && q.bloqueJusqua > m) return { decision: 'refusee', raison: 'bloque', bloqueJusqua: q.bloqueJusqua };

  if (q.maj.byteLength > TAILLE_MAX_MAJ_OCTETS) return { decision: 'refusee', raison: 'taille', ...(await lireCredit(d, q.email)) };

  // Seul ce qui est nouveau pour le serveur compte (un SyncStep2 peut renvoyer du déjà accepté).
  const n = compterCaracteresInseres(q.maj, Y.encodeStateVector(q.ydoc));

  let credit: { restant: number; rechargeA: number } | undefined;
  const jour = jourWat(m);
  if (n > 0) {
    if (q.suivi.longueurTexte(q.ydoc) + n > TAILLE_MAX_DOCUMENT && q.suivi.recalculerLongueur(q.ydoc) + n > TAILLE_MAX_DOCUMENT) {
      return { decision: 'refusee', raison: 'taille', ...(await lireCredit(d, q.email)) };
    }
    const debit = await debiterCredit(d, q.email, n);
    if (!debit.accepte) return { decision: 'refusee', raison: 'credit', restant: debit.restant, rechargeA: debit.rechargeA };
    credit = { restant: debit.restant, rechargeA: debit.rechargeA };
  }

  const seq = nouveauSeq(m);
  q.suivi.debutEcriture(seq);
  try {
    await ecrireJournal(d, { docId: q.docId, seq, maj: q.maj, auteur: q.email, caracteres: n });
  } catch (e) {
    q.suivi.finEcriture(seq);
    if (n > 0) await rembourserCredit(d, q.email, n, jour);
    throw e;
  }
  q.suivi.noterAcceptee(seq, q.email, m, n);
  return { decision: 'acceptee', seq, caracteres: n, ...credit };
}

// Identifiants aléatoires et clés de tri horodatées.
import { randomBytes } from 'node:crypto';

/** Identifiant aléatoire non devinable (lienId, ticket, docId, jetonInvitation). */
export function nouvelId(): string {
  return randomBytes(16).toString('base64url');
}

/** Clé `seq` / `versionId` : ms sur 13 chiffres + '#' + 6 caractères aléatoires. */
export function nouveauSeq(ms: number = Date.now()): string {
  return String(ms).padStart(13, '0') + '#' + randomBytes(6).toString('base64url').slice(0, 6);
}

/** Horodatage (ms) contenu dans un `seq`. */
export function msDuSeq(seq: string): number {
  return Number(seq.slice(0, 13));
}

// Jour WAT et heure de recharge du crédit (pas de tâche planifiée).
import { DECALAGE_WAT_MS } from './constantes.js';

const JOUR_MS = 24 * 3600_000;

/** Jour WAT (AAAA-MM-JJ) d'un horodatage en ms. */
export function jourWat(ms: number = Date.now()): string {
  return new Date(ms + DECALAGE_WAT_MS).toISOString().slice(0, 10);
}

/** Prochain minuit WAT strictement après `ms`, en ms UTC. */
export function prochaineRecharge(ms: number = Date.now()): number {
  const local = ms + DECALAGE_WAT_MS;
  return (Math.floor(local / JOUR_MS) + 1) * JOUR_MS - DECALAGE_WAT_MS;
}

/** Date et heure WAT lisibles : JJ/MM/AAAA HH:MM. */
export function dateHeureWat(ms: number = Date.now()): string {
  const iso = new Date(ms + DECALAGE_WAT_MS).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

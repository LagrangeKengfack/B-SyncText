// Validation simple d'une adresse e-mail (identité déclarative, pas de compte).

const MOTIF_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Adresse en minuscules, sans espaces autour. */
export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Vrai si l'adresse a une forme plausible (après normalisation). */
export function estEmailValide(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const e = normaliserEmail(email);
  return e.length <= 254 && MOTIF_EMAIL.test(e);
}

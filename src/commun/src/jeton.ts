// Jeton de session signé : base64url(json).base64url(hmac-sha256).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DUREE_JETON_MS } from './constantes.js';

export interface ContenuJeton {
  /** Expiration en ms. */
  exp: number;
  [cle: string]: unknown;
}

function signature(partie: string, secret: string): string {
  return createHmac('sha256', secret).update(partie).digest('base64url');
}

/** Signe des données ; ajoute `exp` (maintenant + 7 jours) s'il est absent. */
export function signerJeton(donnees: Record<string, unknown>, secret: string, maintenant: number = Date.now()): string {
  const contenu = { ...donnees, exp: typeof donnees.exp === 'number' ? donnees.exp : maintenant + DUREE_JETON_MS };
  const partie = Buffer.from(JSON.stringify(contenu)).toString('base64url');
  return `${partie}.${signature(partie, secret)}`;
}

/** Contenu du jeton s'il est intact et non expiré, sinon null. */
export function verifierJeton<T extends ContenuJeton = ContenuJeton>(
  jeton: string | undefined | null,
  secret: string,
  maintenant: number = Date.now(),
): T | null {
  if (typeof jeton !== 'string') return null;
  const morceaux = jeton.split('.');
  if (morceaux.length !== 2) return null;
  const [partie, signe] = morceaux as [string, string];
  const attendu = Buffer.from(signature(partie, secret));
  const recu = Buffer.from(signe);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  try {
    const contenu = JSON.parse(Buffer.from(partie, 'base64url').toString('utf8')) as T;
    if (typeof contenu?.exp !== 'number' || contenu.exp <= maintenant) return null;
    return contenu;
  } catch {
    return null;
  }
}

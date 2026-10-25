// Règles de droits et de rôles (05-securite §2, BF-21, H-05). Fonctions pures.
import { estProprietaire, peutRenoncer, peutRetirerRole, successeurPrincipal } from '@b-synctext/commun';
import { ErreurHttp, type Membre, type Role } from './types.js';

export type NouveauRole = 'proprietaire' | 'membre';

/** Exige que l'acteur soit membre ; renvoie son rôle. */
export function exigerMembre(membre: Membre | undefined): Membre {
  if (!membre) throw new ErreurHttp(403, 'interdit', "Vous n'êtes pas membre de ce document.");
  return membre;
}

/** Exige que l'acteur soit propriétaire (principal compris). */
export function exigerProprietaire(membre: Membre | undefined): Membre {
  const m = exigerMembre(membre);
  if (!estProprietaire(m.role)) {
    throw new ErreurHttp(403, 'interdit', 'Réservé aux propriétaires du document.');
  }
  return m;
}

/**
 * Calcule les changements de rôle pour « acteur fixe le rôle de cible ».
 * Liste vide : rien à changer. Lève 403, 404 ou 409.
 */
export function planifierRole(
  membres: Membre[],
  acteur: Membre,
  emailCible: string,
  role: NouveauRole,
): { email: string; role: Role }[] {
  const cible = membres.find((m) => m.email === emailCible);
  if (!cible) throw new ErreurHttp(404, 'introuvable', "Ce rédacteur n'est pas membre du document.");
  if (!estProprietaire(acteur.role)) {
    throw new ErreurHttp(403, 'interdit', 'Réservé aux propriétaires du document.');
  }

  if (role === 'proprietaire') {
    if (cible.role !== 'membre') return [];
    return [{ email: cible.email, role: 'proprietaire' }];
  }

  // role === 'membre'
  if (cible.role === 'membre') return [];
  if (cible.email === acteur.email) {
    const nbProprietaires = membres.filter((m) => estProprietaire(m.role)).length;
    if (!peutRenoncer(acteur.role, nbProprietaires)) {
      throw new ErreurHttp(409, 'dernier_proprietaire', 'Le document doit garder au moins un propriétaire.');
    }
    const changements: { email: string; role: Role }[] = [{ email: acteur.email, role: 'membre' }];
    if (acteur.role === 'principal') {
      const successeur = successeurPrincipal(membres, acteur.email);
      if (!successeur) throw new ErreurHttp(409, 'dernier_proprietaire', 'Aucun successeur possible.');
      changements.push({ email: successeur.email, role: 'principal' });
    }
    return changements;
  }
  if (!peutRetirerRole(acteur.role, cible.role)) {
    throw new ErreurHttp(403, 'interdit', 'Seul le propriétaire principal peut retirer ce rôle.');
  }
  return [{ email: cible.email, role: 'membre' }];
}

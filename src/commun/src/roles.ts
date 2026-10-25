// Règles des rôles d'un document (BF-21, H-05).

export type Role = 'principal' | 'proprietaire' | 'membre';

/** Vrai pour un rôle de propriétaire (principal compris). */
export function estProprietaire(role: Role | undefined | null): boolean {
  return role === 'principal' || role === 'proprietaire';
}

/** Retirer le rôle de propriétaire à un autre : le principal seulement, sur un propriétaire non principal. */
export function peutRetirerRole(roleActeur: Role, roleCible: Role): boolean {
  return roleActeur === 'principal' && roleCible === 'proprietaire';
}

/** Renoncer à son rôle : propriétaire, s'il en reste au moins un autre (principal compris dans le décompte). */
export function peutRenoncer(roleActeur: Role, nombreProprietaires: number): boolean {
  return estProprietaire(roleActeur) && nombreProprietaires >= 2;
}

/** Nouveau principal quand le principal renonce : le propriétaire nommé le plus anciennement. */
export function successeurPrincipal<M extends { email: string; role: Role; nommeLe: number }>(
  membres: M[],
  emailPartant: string,
): M | undefined {
  return membres
    .filter((m) => m.role === 'proprietaire' && m.email !== emailPartant)
    .sort((a, b) => a.nommeLe - b.nommeLe)[0];
}

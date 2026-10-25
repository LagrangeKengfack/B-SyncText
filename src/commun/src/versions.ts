// Numéros de version : v3 (manuelle, restauration), v3.1 (automatique).

/** Libellé d'une version : `v3`, `v3.1`, `v0.1`. */
export function numeroVersion(majeure: number, mineure: number): string {
  return mineure > 0 ? `v${majeure}.${mineure}` : `v${majeure}`;
}

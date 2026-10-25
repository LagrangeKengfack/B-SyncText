// Numéros de version (D-011) : format choisi à la création du document, définitif.
// `v.x` → v1, v2… ; `v.x.x` → v1.0, v1.1, v2.0… ; `v.x.x.x` → v1.0.0, v1.0.1…

export type FormatVersion = 'v.x' | 'v.x.x' | 'v.x.x.x';
export const FORMATS_VERSION: readonly FormatVersion[] = ['v.x', 'v.x.x', 'v.x.x.x'];
export const FORMAT_VERSION_DEFAUT: FormatVersion = 'v.x.x';

export function estFormatVersion(v: unknown): v is FormatVersion {
  return typeof v === 'string' && (FORMATS_VERSION as readonly string[]).includes(v);
}

/** Nombre de chiffres du format : 1, 2 ou 3. */
export function profondeur(format: FormatVersion): number {
  return format.split('.').length - 1;
}

/** Libellé à partir des compteurs `[niv1, niv2, niv3]` : seuls les chiffres du format sont affichés. */
export function numeroVersion(format: FormatVersion, niveaux: readonly number[]): string {
  const p = profondeur(format);
  const chiffres = Array.from({ length: p }, (_, i) => Math.max(0, Math.floor(niveaux[i] ?? 0)));
  return `v${chiffres.join('.')}`;
}

/**
 * Compteurs après incrément du chiffre `niveau` (1 = premier) : les chiffres à droite repassent à 0.
 * Un niveau hors du format est ramené au dernier chiffre.
 */
export function incrementer(niveaux: readonly number[], niveau: number | undefined, format: FormatVersion): number[] {
  const p = profondeur(format);
  const k = niveauEffectif(niveau, format);
  const suite = [0, 1, 2].map((i) => Math.max(0, Math.floor(niveaux[i] ?? 0)));
  suite[k - 1] += 1;
  for (let i = k; i < 3; i++) suite[i] = 0;
  return suite.slice(0, Math.max(p, 3));
}

/** Niveau valide pour le format : entier entre 1 et la profondeur, sinon le dernier chiffre. */
export function niveauEffectif(niveau: number | undefined, format: FormatVersion): number {
  const p = profondeur(format);
  return Number.isInteger(niveau) && (niveau as number) >= 1 && (niveau as number) <= p ? (niveau as number) : p;
}

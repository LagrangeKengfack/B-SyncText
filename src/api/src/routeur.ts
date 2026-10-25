// Petit routeur sans framework : méthode + motif de chemin avec {paramètres}.

export type Params = Record<string, string>;

export interface Route<T> {
  methode: string;
  motif: string;
  gestionnaire: T;
}

export interface Resultat<T> {
  route: Route<T>;
  params: Params;
}

/** Trouve la route correspondant à la méthode et au chemin ; null si aucune. */
export function trouverRoute<T>(
  routes: Route<T>[],
  methode: string,
  chemin: string,
): Resultat<T> | { chemin: true } | null {
  const segments = chemin.split('/').filter(Boolean);
  let cheminConnu = false;
  for (const route of routes) {
    const motif = route.motif.split('/').filter(Boolean);
    if (motif.length !== segments.length) continue;
    const params: Params = {};
    let ok = true;
    for (let i = 0; i < motif.length; i++) {
      const m = motif[i]!;
      const s = segments[i]!;
      if (m.startsWith('{') && m.endsWith('}')) {
        try {
          params[m.slice(1, -1)] = decodeURIComponent(s);
        } catch {
          ok = false;
          break;
        }
      } else if (m !== s) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    cheminConnu = true;
    if (route.methode === methode) return { route, params };
  }
  return cheminConnu ? { chemin: true } : null;
}

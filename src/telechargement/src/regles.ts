// Règles pures du téléchargement : réponses, erreurs de débit, textes.
import { dateHeureWat } from '@b-synctext/commun';

export interface ReponseHttp {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

const ENTETES_JSON = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(statusCode: number, corps: unknown): ReponseHttp {
  return { statusCode, headers: { ...ENTETES_JSON }, body: JSON.stringify(corps) };
}

export function erreur(statusCode: number, code: string, message: string): ReponseHttp {
  return json(statusCode, { erreur: { code, message } });
}

export const introuvable = (): ReponseHttp => erreur(404, 'introuvable', 'Lien inconnu.');

export type ReponseDemande =
  | { etat: 'pret'; ticket: string; expireA: number; restants: number; n: number }
  | { etat: 'patientez'; reessayerDans: 2; restants: 0; n: number }
  | { etat: 'epuise'; n: number };

export const pret = (ticket: string, expireA: number, restants: number, n: number): ReponseDemande =>
  ({ etat: 'pret', ticket, expireA, restants, n });
export const patientez = (n: number): ReponseDemande => ({ etat: 'patientez', reessayerDans: 2, restants: 0, n });
export const epuise = (n: number): ReponseDemande => ({ etat: 'epuise', n });

// Identifiant aléatoire : 22 caractères base64url (refus immédiat sinon, sans lire la base).
const MOTIF_ID = /^[A-Za-z0-9_-]{22}$/;
export const estIdValide = (id: string | undefined | null): id is string => typeof id === 'string' && MOTIF_ID.test(id);

/** Route reconnue à partir de la méthode et du chemin. */
export type Route =
  | { route: 'lien'; lienId: string }
  | { route: 'demandes'; lienId: string }
  | { route: 'fichier'; lienId: string }
  | null;

export function trouverRoute(methode: string, chemin: string): Route {
  const m = /^(?:\/api)?\/liens\/([^/]+)(\/demandes|\/fichier)?\/?$/.exec(chemin);
  if (!m) return null;
  const lienId = decodeURIComponent(m[1]!);
  if (methode === 'GET' && !m[2]) return { route: 'lien', lienId };
  if (methode === 'POST' && m[2] === '/demandes') return { route: 'demandes', lienId };
  if (methode === 'GET' && m[2] === '/fichier') return { route: 'fichier', lienId };
  return null;
}

const NOMS_DEBIT = new Set([
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'RequestLimitExceeded',
  'TransactionConflictException',
  'TransactionInProgressException',
  'LimitExceededException',
]);
const RAISONS_DEBIT = new Set(['ThrottlingError', 'TransactionConflict', 'ProvisionedThroughputExceeded', 'RequestLimitExceeded']);

interface ErreurAws { name?: string; CancellationReasons?: { Code?: string }[] }

/** Vrai pour une erreur de débit ou de conflit DynamoDB (à traiter comme « patientez »). */
export function estErreurDebit(e: unknown): boolean {
  const err = e as ErreurAws | null;
  if (!err || typeof err !== 'object') return false;
  if (err.name && NOMS_DEBIT.has(err.name)) return true;
  if (err.name === 'TransactionCanceledException') {
    return (err.CancellationReasons ?? []).some((r) => r.Code !== undefined && RAISONS_DEBIT.has(r.Code));
  }
  return false;
}

/** Vrai pour un refus de condition (écriture simple ou transaction annulée par une condition). */
export function estRefusCondition(e: unknown): boolean {
  const err = e as ErreurAws | null;
  if (!err || typeof err !== 'object') return false;
  if (err.name === 'ConditionalCheckFailedException') return true;
  if (err.name === 'TransactionCanceledException') {
    const raisons = err.CancellationReasons ?? [];
    return raisons.some((r) => r.Code === 'ConditionalCheckFailed') && !raisons.some((r) => r.Code !== undefined && RAISONS_DEBIT.has(r.Code));
  }
  return false;
}

/** Numéro d'exemplaire imprimé en pied de page (sans date ni heure). */
export function libelleExemplaire(k: number, n: number): string {
  return `Exemplaire ${k} / ${n}`;
}

/** Nom de fichier sûr : `<titre>-exemplaire-<k>.pdf`. */
export function nomFichier(titre: string, k: number): string {
  const propre = titre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'document';
  return `${propre}-exemplaire-${k}.pdf`;
}

/** E-mail « lien épuisé » (texte simple, sans adresse de lien). */
export function courrielEpuise(titre: string, n: number, epuiseLe: number, nom?: string): { sujet: string; texte: string } {
  return {
    sujet: `Lien épuisé : « ${titre} »`,
    texte:
      `Bonjour${nom ? ' ' + nom : ''},\n\n` +
      `Le lien de téléchargement du document « ${titre} » vient d'atteindre son dernier téléchargement : ` +
      `les ${n} exemplaire${n > 1 ? 's ont été téléchargés' : ' a été téléchargé'}.\n` +
      `Le lien est désactivé depuis le ${dateHeureWat(epuiseLe)} (heure WAT).\n\n` +
      `B-SyncText\n`,
  };
}

/** Liens vus épuisés par cette instance : réponse immédiate, sans lire la base (C-6). */
export class CacheEpuises {
  private readonly liens = new Map<string, { titre: string; n: number }>();
  constructor(private readonly taille = 10_000) {}
  ajouter(lienId: string, titre: string, n: number): void {
    if (this.liens.size >= this.taille) this.liens.delete(this.liens.keys().next().value!);
    this.liens.set(lienId, { titre, n });
  }
  lire(lienId: string): { titre: string; n: number } | undefined {
    return this.liens.get(lienId);
  }
}

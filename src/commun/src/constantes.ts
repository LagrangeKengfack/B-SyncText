// Constantes partagées par le serveur d'édition et les Lambda.

/** Crédit d'écriture d'un rédacteur par jour (C-4). */
export const CREDIT_JOURNALIER = 10_000;

/** Taille maximale d'un document, en caractères (H-12). */
export const TAILLE_MAX_DOCUMENT = 200_000;

/** Durée de réservation d'un exemplaire avant remise en stock (H-07). */
export const DUREE_RESERVATION_MS = 60_000;

/** Nombre de refus en une minute qui déclenche un blocage (H-10). */
export const SEUIL_REFUS = 20;

/** Durée d'un blocage temporaire (H-10). */
export const DUREE_BLOCAGE_MS = 15 * 60_000;

/** Durée de validité d'un jeton de session. */
export const DUREE_JETON_MS = 7 * 24 * 3600_000;

/** Décalage du fuseau WAT (UTC+1). */
export const DECALAGE_WAT_MS = 3600_000;

// Types partagés par le routeur, les règles et l'accès aux données.

export type Role = 'principal' | 'proprietaire' | 'membre';

export interface Redacteur {
  email: string;
  nom: string;
  creeLe: number;
  bloqueJusqua?: number;
  motifBlocage?: string;
}

export interface Document {
  docId: string;
  titre: string;
  creeLe: number;
  creePar: string;
  modifieLe: number;
  jetonInvitation: string;
  versionMajeure: number;
  versionMineure: number;
  connectes?: number;
  presenceMaj?: number;
}

export interface Membre {
  docId: string;
  email: string;
  nom: string;
  role: Role;
  nommeLe: number;
}

export interface Version {
  docId: string;
  versionId: string;
  numero: string;
  nom?: string;
  type: 'auto' | 'manuelle' | 'restauration';
  auteur: string;
  creeLe: number;
  cleS3: string;
}

export interface Lien {
  lienId: string;
  docId: string;
  titre: string;
  creePar: string;
  creeParNom: string;
  n: number;
  disponibles: number;
  comptes: number;
  numerotation: number;
  etat: 'actif' | 'epuise';
  emailEnvoye?: boolean;
  emailErreur?: string;
  notifie: boolean;
  creeLe: number;
}

/** Accès aux données : implémenté par DynamoDB/S3 en production, par un faux en test. */
export interface Donnees {
  getRedacteur(email: string): Promise<Redacteur | undefined>;
  /** Crée la fiche si absente ; sinon met le nom à jour. Renvoie la fiche. */
  assurerRedacteur(email: string, nom: string, maintenant: number): Promise<Redacteur>;
  getCredit(email: string, jour: string): Promise<number | undefined>;

  creerDocument(doc: Document, createur: Membre): Promise<void>;
  getDocument(docId: string): Promise<Document | undefined>;
  getDocuments(docIds: string[]): Promise<Document[]>;
  definirJetonInvitation(docId: string, jeton: string): Promise<void>;
  renommerDocument(docId: string, titre: string): Promise<void>;

  getMembre(docId: string, email: string): Promise<Membre | undefined>;
  listerMembres(docId: string): Promise<Membre[]>;
  listerMembresDe(email: string): Promise<Membre[]>;
  /** Ajoute le membre s'il est absent ; renvoie false s'il l'était déjà. */
  ajouterMembre(membre: Membre): Promise<boolean>;
  /** Applique plusieurs changements de rôle de façon atomique. */
  changerRoles(docId: string, changements: { email: string; role: Role }[]): Promise<void>;

  listerVersions(docId: string): Promise<Version[]>;
  getVersion(docId: string, versionId: string): Promise<Version | undefined>;
  lireEtatVersion(cleS3: string): Promise<Uint8Array | undefined>;

  creerLien(lien: Lien): Promise<void>;
  listerLiens(docId: string): Promise<Lien[]>;

  /** Ajoute 1 au compteur et renvoie la nouvelle valeur. */
  incrementerCompteur(cle: string, expireS: number): Promise<number>;
  lireCompteur(cle: string): Promise<number>;

  scanDocumentsOuverts(depuis: number): Promise<Document[]>;
  scanLiensActifs(): Promise<Lien[]>;
  scanRedacteursBloques(maintenant: number): Promise<Redacteur[]>;
}

/** Secrets lus une fois au démarrage (SSM). */
export interface Secrets {
  secretSession(): Promise<string>;
  codeAdmin(): Promise<string>;
}

export interface Contexte {
  donnees: Donnees;
  secrets: Secrets;
  maintenant: () => number;
  /** Convertit un état Yjs en blocs (yjsVersBlocs de commun). */
  versBlocs: (etat: Uint8Array) => unknown;
}

export class ErreurHttp extends Error {
  constructor(
    public statut: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

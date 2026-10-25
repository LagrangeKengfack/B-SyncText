// Accès DynamoDB du téléchargement, derrière une interface (remplaçable en test).
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { estErreurDebit, estRefusCondition } from './regles.js';

/** Réessaie une écriture refusée pour débit (jusqu'à ~6 s, avec gigue). */
async function avecReessais<T>(f: () => Promise<T>): Promise<T> {
  for (let essai = 0; ; essai++) {
    try {
      return await f();
    } catch (e) {
      if (!estErreurDebit(e) || essai >= 8) throw e;
      await new Promise((r) => setTimeout(r, 50 * 2 ** Math.min(essai, 5) + Math.random() * 100));
    }
  }
}

export interface Lien {
  lienId: string;
  docId: string;
  titre: string;
  creePar: string;
  creeParNom?: string;
  n: number;
  disponibles: number;
  comptes: number;
  numerotation: number;
  etat: 'actif' | 'epuise';
  notifie?: boolean;
  creeLe: number;
  epuiseLe?: number;
}

export interface Depot {
  /** Lecture du lien (cohérence éventuelle). */
  lireLien(lienId: string): Promise<Lien | undefined>;
  /** disponibles - 1 SI disponibles > 0 ET etat = actif ; rend le lien après écriture, ou null si refusé. */
  reserver(lienId: string): Promise<Lien | null>;
  /** Enregistre la réservation (statut reserve, attente = lienId). */
  creerReservation(ticket: string, lienId: string, expireA: number): Promise<void>;
  /** Rend l'exemplaire si la réservation n'a pas pu être écrite. */
  annulerReservation(lienId: string): Promise<void>;
  /** Quelques tickets réservés et expirés (index enAttente). */
  chercherExpirees(lienId: string, maintenant: number, limite: number): Promise<string[]>;
  /** reserve → expire SI expireA <= maintenant, puis disponibles + 1 ; faux si la condition est refusée. */
  remettreEnStock(ticket: string, lienId: string, maintenant: number): Promise<boolean>;
  /** reserve → compte SI expireA > maintenant ; faux si ticket invalide, expiré ou déjà compté. */
  compter(ticket: string, lienId: string, maintenant: number): Promise<boolean>;
  /** numerotation + 1 et comptes + 1 ; rend le lien après écriture (k = numerotation). */
  numeroter(lienId: string): Promise<Lien>;
  /** etat = epuise SI etat = actif ET comptes >= n. */
  marquerEpuise(lienId: string, maintenant: number): Promise<void>;
  /** notifie = true SI notifie = false (ou absent) ; vrai si c'est cet appel qui l'a posé. */
  marquerNotifie(lienId: string): Promise<boolean>;
}

export function depotDynamo(ddb: DynamoDBDocumentClient, tableLiens: string, tableReservations: string): Depot {
  return {
    async lireLien(lienId) {
      const r = await ddb.send(new GetCommand({ TableName: tableLiens, Key: { lienId } }));
      return r.Item as Lien | undefined;
    },

    async reserver(lienId) {
      try {
        const r = await ddb.send(new UpdateCommand({
          TableName: tableLiens,
          Key: { lienId },
          UpdateExpression: 'SET disponibles = disponibles - :un',
          ConditionExpression: 'disponibles > :zero AND etat = :actif',
          ExpressionAttributeValues: { ':un': 1, ':zero': 0, ':actif': 'actif' },
          ReturnValues: 'ALL_NEW',
        }));
        return r.Attributes as Lien;
      } catch (e) {
        if (estRefusCondition(e)) return null;
        throw e;
      }
    },

    async creerReservation(ticket, lienId, expireA) {
      await ddb.send(new PutCommand({
        TableName: tableReservations,
        Item: { ticket, lienId, statut: 'reserve', expireA, attente: lienId },
        ConditionExpression: 'attribute_not_exists(ticket)',
      }));
    },

    async annulerReservation(lienId) {
      await ddb.send(new UpdateCommand({
        TableName: tableLiens,
        Key: { lienId },
        UpdateExpression: 'ADD disponibles :un',
        ConditionExpression: 'attribute_exists(lienId)',
        ExpressionAttributeValues: { ':un': 1 },
      }));
    },

    async chercherExpirees(lienId, maintenant, limite) {
      const r = await ddb.send(new QueryCommand({
        TableName: tableReservations,
        IndexName: 'enAttente',
        KeyConditionExpression: 'attente = :l AND expireA <= :m',
        ExpressionAttributeValues: { ':l': lienId, ':m': maintenant },
        Limit: limite,
      }));
      return (r.Items ?? []).map((i) => i.ticket as string);
    },

    // Pas de transaction sur la fiche du lien : au pic, des centaines d'écritures la visent en même
    // temps et DynamoDB annulerait les transactions en conflit (TransactionConflict). On enchaîne
    // deux écritures conditionnelles simples ; une panne entre les deux perd au pire un exemplaire,
    // jamais un de trop (06 §1).
    async remettreEnStock(ticket, lienId, maintenant) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: tableReservations,
          Key: { ticket },
          UpdateExpression: 'SET statut = :expire REMOVE attente',
          ConditionExpression: 'statut = :reserve AND expireA <= :m AND lienId = :l',
          ExpressionAttributeValues: { ':expire': 'expire', ':reserve': 'reserve', ':m': maintenant, ':l': lienId },
        }));
      } catch (e) {
        if (estRefusCondition(e)) return false;
        throw e;
      }
      await avecReessais(() => ddb.send(new UpdateCommand({
        TableName: tableLiens,
        Key: { lienId },
        UpdateExpression: 'ADD disponibles :un',
        ExpressionAttributeValues: { ':un': 1 },
      })));
      return true;
    },

    async compter(ticket, lienId, maintenant) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: tableReservations,
          Key: { ticket },
          UpdateExpression: 'SET statut = :compte REMOVE attente',
          ConditionExpression: 'statut = :reserve AND expireA > :m AND lienId = :l',
          ExpressionAttributeValues: { ':compte': 'compte', ':reserve': 'reserve', ':m': maintenant, ':l': lienId },
        }));
        return true;
      } catch (e) {
        if (estRefusCondition(e)) return false;
        throw e;
      }
    },

    // Le ticket est déjà consommé : on insiste jusqu'à obtenir le numéro, sinon l'exemplaire
    // serait compté sans être livré.
    async numeroter(lienId) {
      const r = await avecReessais(() => ddb.send(new UpdateCommand({
        TableName: tableLiens,
        Key: { lienId },
        UpdateExpression: 'ADD numerotation :un, comptes :un',
        ExpressionAttributeValues: { ':un': 1 },
        ReturnValues: 'ALL_NEW',
      })));
      return r.Attributes as Lien;
    },

    async marquerEpuise(lienId, maintenant) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: tableLiens,
          Key: { lienId },
          UpdateExpression: 'SET etat = :epuise, epuiseLe = :m',
          ConditionExpression: 'etat = :actif AND comptes >= #n',
          ExpressionAttributeNames: { '#n': 'n' },
          ExpressionAttributeValues: { ':epuise': 'epuise', ':actif': 'actif', ':m': maintenant },
        }));
      } catch (e) {
        if (!estRefusCondition(e)) throw e;
      }
    },

    async marquerNotifie(lienId) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: tableLiens,
          Key: { lienId },
          UpdateExpression: 'SET notifie = :vrai',
          ConditionExpression: 'attribute_exists(lienId) AND (notifie = :faux OR attribute_not_exists(notifie))',
          ExpressionAttributeValues: { ':vrai': true, ':faux': false },
        }));
        return true;
      } catch (e) {
        if (estRefusCondition(e)) return false;
        throw e;
      }
    },
  };
}

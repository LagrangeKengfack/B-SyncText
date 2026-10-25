// Accès DynamoDB / S3 / SSM. Les clients sont injectés (testables, pas d'appel AWS ici).
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  BatchGetCommand,
  type BatchGetCommandOutput,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import type { Document, Donnees, Lien, Membre, Redacteur, Role, Secrets, Version } from './types.js';

export interface Tables {
  redacteurs: string;
  credits: string;
  documents: string;
  membres: string;
  versions: string;
  liens: string;
  compteurs: string;
}

export function tablesDepuisEnv(env: NodeJS.ProcessEnv): Tables {
  const lire = (n: string): string => {
    const v = env[n];
    if (!v) throw new Error(`Variable d'environnement manquante : ${n}`);
    return v;
  };
  return {
    redacteurs: lire('TABLE_REDACTEURS'),
    credits: lire('TABLE_CREDITS'),
    documents: lire('TABLE_DOCUMENTS'),
    membres: lire('TABLE_MEMBRES'),
    versions: lire('TABLE_VERSIONS'),
    liens: lire('TABLE_LIENS'),
    compteurs: lire('TABLE_COMPTEURS'),
  };
}

export function creerDonnees(db: DynamoDBDocumentClient, s3: S3Client, bucket: string, t: Tables): Donnees {
  /** Lit toutes les pages d'une requête Query ou Scan. */
  async function toutes<T>(
    commande: (cle: Record<string, unknown> | undefined) => QueryCommand | ScanCommand,
  ): Promise<T[]> {
    const resultat: T[] = [];
    let cle: Record<string, unknown> | undefined;
    do {
      const r = await db.send(commande(cle));
      resultat.push(...((r.Items ?? []) as T[]));
      cle = r.LastEvaluatedKey;
    } while (cle);
    return resultat;
  }

  return {
    async getRedacteur(email) {
      const r = await db.send(new GetCommand({ TableName: t.redacteurs, Key: { email } }));
      return r.Item as Redacteur | undefined;
    },

    async assurerRedacteur(email, nom, maintenant) {
      const r = await db.send(
        new UpdateCommand({
          TableName: t.redacteurs,
          Key: { email },
          UpdateExpression: 'SET nom = :nom, creeLe = if_not_exists(creeLe, :now)',
          ExpressionAttributeValues: { ':nom': nom, ':now': maintenant },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return { email, ...r.Attributes } as Redacteur;
    },

    async getCredit(email, jour) {
      const r = await db.send(new GetCommand({ TableName: t.credits, Key: { email, jour } }));
      return r.Item?.restant as number | undefined;
    },

    async creerDocument(doc, createur) {
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: t.documents,
                Item: doc,
                ConditionExpression: 'attribute_not_exists(docId)',
              },
            },
            { Put: { TableName: t.membres, Item: createur } },
          ],
        }),
      );
    },

    async getDocument(docId) {
      const r = await db.send(new GetCommand({ TableName: t.documents, Key: { docId } }));
      return r.Item as Document | undefined;
    },

    async getDocuments(docIds) {
      const uniques = [...new Set(docIds)];
      const resultat: Document[] = [];
      for (let i = 0; i < uniques.length; i += 100) {
        let demande: Record<string, { Keys: Record<string, unknown>[] }> | undefined = {
          [t.documents]: { Keys: uniques.slice(i, i + 100).map((docId) => ({ docId })) },
        };
        while (demande) {
          const r: BatchGetCommandOutput = await db.send(new BatchGetCommand({ RequestItems: demande }));
          resultat.push(...((r.Responses?.[t.documents] ?? []) as Document[]));
          const reste = r.UnprocessedKeys;
          demande = reste && Object.keys(reste).length > 0 ? (reste as typeof demande) : undefined;
        }
      }
      return resultat;
    },

    async definirJetonInvitation(docId, jeton) {
      await db.send(
        new UpdateCommand({
          TableName: t.documents,
          Key: { docId },
          UpdateExpression: 'SET jetonInvitation = :j',
          ExpressionAttributeValues: { ':j': jeton },
          ConditionExpression: 'attribute_exists(docId)',
        }),
      );
    },

    async renommerDocument(docId, titre) {
      await db.send(
        new UpdateCommand({
          TableName: t.documents,
          Key: { docId },
          UpdateExpression: 'SET titre = :t',
          ExpressionAttributeValues: { ':t': titre },
          ConditionExpression: 'attribute_exists(docId)',
        }),
      );
    },

    async getMembre(docId, email) {
      const r = await db.send(new GetCommand({ TableName: t.membres, Key: { docId, email } }));
      return r.Item as Membre | undefined;
    },

    listerMembres(docId) {
      return toutes<Membre>(
        (cle) =>
          new QueryCommand({
            TableName: t.membres,
            KeyConditionExpression: 'docId = :d',
            ExpressionAttributeValues: { ':d': docId },
            ConsistentRead: true,
            ExclusiveStartKey: cle,
          }),
      );
    },

    listerMembresDe(email) {
      return toutes<Membre>(
        (cle) =>
          new QueryCommand({
            TableName: t.membres,
            IndexName: 'parEmail',
            KeyConditionExpression: 'email = :e',
            ExpressionAttributeValues: { ':e': email },
            ExclusiveStartKey: cle,
          }),
      );
    },

    async ajouterMembre(membre) {
      try {
        await db.send(
          new PutCommand({
            TableName: t.membres,
            Item: membre,
            ConditionExpression: 'attribute_not_exists(email)',
          }),
        );
        return true;
      } catch (e) {
        if ((e as { name?: string }).name === 'ConditionalCheckFailedException') return false;
        throw e;
      }
    },

    async changerRoles(docId, changements) {
      await db.send(
        new TransactWriteCommand({
          TransactItems: changements.map((c: { email: string; role: Role }) => ({
            Update: {
              TableName: t.membres,
              Key: { docId, email: c.email },
              UpdateExpression: 'SET #r = :r',
              ConditionExpression: 'attribute_exists(email)',
              ExpressionAttributeNames: { '#r': 'role' },
              ExpressionAttributeValues: { ':r': c.role },
            },
          })),
        }),
      );
    },

    listerVersions(docId) {
      return toutes<Version>(
        (cle) =>
          new QueryCommand({
            TableName: t.versions,
            KeyConditionExpression: 'docId = :d',
            ExpressionAttributeValues: { ':d': docId },
            ScanIndexForward: false,
            ExclusiveStartKey: cle,
          }),
      );
    },

    async getVersion(docId, versionId) {
      const r = await db.send(new GetCommand({ TableName: t.versions, Key: { docId, versionId } }));
      return r.Item as Version | undefined;
    },

    async lireEtatVersion(cleS3) {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: cleS3 }));
        return r.Body ? await r.Body.transformToByteArray() : undefined;
      } catch (e) {
        if ((e as { name?: string }).name === 'NoSuchKey') return undefined;
        throw e;
      }
    },

    async creerLien(lien) {
      await db.send(
        new PutCommand({
          TableName: t.liens,
          Item: lien,
          ConditionExpression: 'attribute_not_exists(lienId)',
        }),
      );
    },

    listerLiens(docId) {
      return toutes<Lien>(
        (cle) =>
          new QueryCommand({
            TableName: t.liens,
            IndexName: 'parDocument',
            KeyConditionExpression: 'docId = :d',
            ExpressionAttributeValues: { ':d': docId },
            ScanIndexForward: false,
            ExclusiveStartKey: cle,
          }),
      );
    },

    async incrementerCompteur(cle, expireS) {
      const r = await db.send(
        new UpdateCommand({
          TableName: t.compteurs,
          Key: { cle },
          UpdateExpression: 'ADD valeur :un SET #e = :e',
          ExpressionAttributeNames: { '#e': 'expire' },
          ExpressionAttributeValues: { ':un': 1, ':e': expireS },
          ReturnValues: 'UPDATED_NEW',
        }),
      );
      return Number(r.Attributes?.valeur ?? 1);
    },

    async lireCompteur(cle) {
      const r = await db.send(new GetCommand({ TableName: t.compteurs, Key: { cle }, ConsistentRead: true }));
      return Number(r.Item?.valeur ?? 0);
    },

    scanDocumentsOuverts(depuis) {
      return toutes<Document>(
        (cle) =>
          new ScanCommand({
            TableName: t.documents,
            FilterExpression: 'connectes > :zero AND presenceMaj > :depuis',
            ExpressionAttributeValues: { ':zero': 0, ':depuis': depuis },
            ExclusiveStartKey: cle,
          }),
      );
    },

    scanLiensActifs() {
      return toutes<Lien>(
        (cle) =>
          new ScanCommand({
            TableName: t.liens,
            FilterExpression: '#e = :actif',
            ExpressionAttributeNames: { '#e': 'etat' },
            ExpressionAttributeValues: { ':actif': 'actif' },
            ExclusiveStartKey: cle,
          }),
      );
    },

    scanRedacteursBloques(maintenant) {
      return toutes<Redacteur>(
        (cle) =>
          new ScanCommand({
            TableName: t.redacteurs,
            FilterExpression: 'bloqueJusqua > :m',
            ExpressionAttributeValues: { ':m': maintenant },
            ExclusiveStartKey: cle,
          }),
      );
    },
  };
}

/** Secrets SSM, lus une seule fois (promesse mise en cache), avec déchiffrement. */
export function creerSecrets(ssm: SSMClient, nomSecretSession: string, nomCodeAdmin: string): Secrets {
  const cache = new Map<string, Promise<string>>();
  const lire = (nom: string): Promise<string> => {
    let p = cache.get(nom);
    if (!p) {
      p = ssm.send(new GetParameterCommand({ Name: nom, WithDecryption: true })).then((r) => {
        const v = r.Parameter?.Value;
        if (!v) throw new Error('Paramètre SSM vide');
        return v;
      });
      // En cas d'échec on n'enferme pas l'erreur : le prochain appel réessaie.
      p.catch(() => cache.delete(nom));
      cache.set(nom, p);
    }
    return p;
  };
  return { secretSession: () => lire(nomSecretSession), codeAdmin: () => lire(nomCodeAdmin) };
}

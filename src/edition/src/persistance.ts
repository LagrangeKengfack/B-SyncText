// Journal DynamoDB des modifications acceptées et états compactés dans S3 (C-2).
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { msDuSeq } from '@b-synctext/commun';
import * as Y from 'yjs';
import { expireDans, type Dependances } from './dependances.js';

/** Marge de relecture du journal avant le `seq` d'un état compacté. */
export const MARGE_RELECTURE_MS = 10_000;

export interface EntreeJournal {
  docId: string;
  seq: string;
  maj: Uint8Array;
  auteur: string;
  caracteres: number;
}

/** Écrit une modification ; elle est « acceptée » quand cette promesse est résolue. */
export async function ecrireJournal(d: Dependances, e: EntreeJournal): Promise<void> {
  await d.ddb.send(
    new PutCommand({
      TableName: d.tables.journal,
      Item: { ...e, expire: expireDans(d.maintenant(), 7 * 86_400) },
    }),
  );
}

/** Toutes les entrées de seq >= seqMin, en lecture forte, dans l'ordre. */
export async function lireJournalDepuis(d: Dependances, docId: string, seqMin: string): Promise<EntreeJournal[]> {
  const entrees: EntreeJournal[] = [];
  let depart: Record<string, unknown> | undefined;
  do {
    const r = await d.ddb.send(
      new QueryCommand({
        TableName: d.tables.journal,
        KeyConditionExpression: 'docId = :d AND seq >= :s',
        ExpressionAttributeValues: { ':d': docId, ':s': seqMin },
        ConsistentRead: true,
        ExclusiveStartKey: depart,
      }),
    );
    for (const item of r.Items ?? []) entrees.push(item as EntreeJournal);
    depart = r.LastEvaluatedKey;
  } while (depart);
  return entrees;
}

export function cleEtat(docId: string): string {
  return `etats/${docId}.bin`;
}

/** Lit un objet S3 ; undefined s'il n'existe pas. */
export async function lireObjet(
  d: Dependances,
  cle: string,
): Promise<{ octets: Uint8Array; metadonnees: Record<string, string> } | undefined> {
  try {
    const r = await d.s3.send(new GetObjectCommand({ Bucket: d.bucket, Key: cle }));
    const octets: Uint8Array = await r.Body.transformToByteArray();
    return { octets, metadonnees: r.Metadata ?? {} };
  } catch (e) {
    const nom = (e as { name?: string })?.name;
    if (nom === 'NoSuchKey' || nom === 'NotFound') return undefined;
    throw e;
  }
}

export interface ResultatReconstruction {
  /** seq de l'état S3 chargé, s'il existe. */
  seqEtat?: string;
  /** Dernier seq appliqué (journal ou état). */
  dernierSeq?: string;
  entreesRejouees: number;
}

/**
 * Reconstruit un document : état S3 puis toutes les entrées du journal
 * de seq >= seqEtat − 10 s (lecture forte). Yjs ignore les doublons.
 */
export async function reconstruire(d: Dependances, docId: string, ydoc: Y.Doc): Promise<ResultatReconstruction> {
  const etat = await lireObjet(d, cleEtat(docId));
  let seqEtat: string | undefined;
  let seqMin = '0';
  if (etat) {
    Y.applyUpdate(ydoc, etat.octets);
    seqEtat = etat.metadonnees.seq;
    if (seqEtat) seqMin = String(Math.max(0, msDuSeq(seqEtat) - MARGE_RELECTURE_MS)).padStart(13, '0');
  }
  const entrees = await lireJournalDepuis(d, docId, seqMin);
  for (const e of entrees) Y.applyUpdate(ydoc, e.maj);
  const dernier = entrees.at(-1)?.seq;
  const dernierSeq = dernier && (!seqEtat || dernier > seqEtat) ? dernier : seqEtat;
  return { seqEtat, dernierSeq, entreesRejouees: entrees.length };
}

/** Écrit l'état complet du document dans S3, avec le seq du journal qu'il couvre. */
export async function compacter(d: Dependances, docId: string, etat: Uint8Array, seq: string): Promise<void> {
  await d.s3.send(
    new PutObjectCommand({
      Bucket: d.bucket,
      Key: cleEtat(docId),
      Body: etat,
      ContentType: 'application/octet-stream',
      Metadata: { seq },
    }),
  );
}

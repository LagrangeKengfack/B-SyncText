// Reconstruction du document au moment du clic (C-3), numéro de version et PDF de base en cache S3.
import * as Y from 'yjs';
import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { msDuSeq, nouveauSeq, numeroVersion, yjsVersBlocs } from '@b-synctext/commun';
import { genererPdfBase } from './pdf.js';
import { estRefusCondition } from './regles.js';

export interface DepsDocument {
  ddb: DynamoDBDocumentClient;
  s3: S3Client;
  bucket: string;
  tableJournal: string;
  tableDocuments: string;
  tableVersions: string;
}

/** Marge de recouvrement entre l'état compacté et le journal. */
const RECOUVREMENT_MS = 10_000;

async function lireObjet(s3: S3Client, bucket: string, cle: string): Promise<{ corps: Uint8Array; meta: Record<string, string> } | null> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: cle }));
    return { corps: await r.Body!.transformToByteArray(), meta: r.Metadata ?? {} };
  } catch (e) {
    const nom = (e as { name?: string }).name;
    if (nom === 'NoSuchKey' || nom === 'NotFound') return null;
    throw e;
  }
}

/** Document tel qu'il est maintenant : état S3 + tout le journal récent (lecture forte). */
export async function reconstruire(d: DepsDocument, docId: string): Promise<{ ydoc: Y.Doc; seq: string }> {
  const ydoc = new Y.Doc();
  const etat = await lireObjet(d.s3, d.bucket, `etats/${docId}.bin`);
  const seqEtat = etat?.meta.seq;
  if (etat) Y.applyUpdate(ydoc, etat.corps);

  let dernier = seqEtat ?? '';
  let depart: Record<string, unknown> | undefined;
  const borne = seqEtat ? String(Math.max(0, msDuSeq(seqEtat) - RECOUVREMENT_MS)).padStart(13, '0') : undefined;
  const majs: Uint8Array[] = [];
  do {
    const r = await d.ddb.send(new QueryCommand({
      TableName: d.tableJournal,
      KeyConditionExpression: borne ? 'docId = :d AND #s >= :b' : 'docId = :d',
      ExpressionAttributeNames: { '#s': 'seq', '#m': 'maj' },
      ExpressionAttributeValues: borne ? { ':d': docId, ':b': borne } : { ':d': docId },
      ProjectionExpression: '#s, #m',
      ConsistentRead: true,
      ExclusiveStartKey: depart,
    }));
    for (const item of r.Items ?? []) {
      majs.push(item.maj as Uint8Array);
      if ((item.seq as string) > dernier) dernier = item.seq as string;
    }
    depart = r.LastEvaluatedKey;
  } while (depart);
  // Yjs ignore les doublons et ordonne lui-même les mises à jour.
  if (majs.length) Y.applyUpdate(ydoc, Y.mergeUpdates(majs));
  return { ydoc, seq: dernier || 'initial' };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Numéro de version de l'état `seq` ; crée une version automatique s'il n'en existe pas. */
export async function numeroPourEtat(d: DepsDocument, docId: string, seq: string, ydoc: Y.Doc, maintenant: number): Promise<string> {
  let gagne: Record<string, unknown> | undefined;
  try {
    const r = await d.ddb.send(new UpdateCommand({
      TableName: d.tableDocuments,
      Key: { docId },
      UpdateExpression: 'ADD versionMineure :un SET derniereVersionSeq = :seq',
      ConditionExpression: 'attribute_exists(docId) AND (attribute_not_exists(derniereVersionSeq) OR derniereVersionSeq <> :seq)',
      ExpressionAttributeValues: { ':un': 1, ':seq': seq },
      ReturnValues: 'ALL_NEW',
    }));
    gagne = r.Attributes;
  } catch (e) {
    if (!estRefusCondition(e)) throw e;
  }

  if (gagne) {
    const numero = numeroVersion(Number(gagne.versionMajeure ?? 0), Number(gagne.versionMineure ?? 0));
    await d.ddb.send(new UpdateCommand({
      TableName: d.tableDocuments,
      Key: { docId },
      UpdateExpression: 'SET derniereVersionNumero = :num',
      ConditionExpression: 'derniereVersionSeq = :seq',
      ExpressionAttributeValues: { ':num': numero, ':seq': seq },
    })).catch((e) => { if (!estRefusCondition(e)) throw e; });
    const versionId = nouveauSeq(maintenant);
    const cleS3 = `versions/${docId}/${versionId}.bin`;
    await d.s3.send(new PutObjectCommand({ Bucket: d.bucket, Key: cleS3, Body: Y.encodeStateAsUpdate(ydoc), ContentType: 'application/octet-stream' }));
    await d.ddb.send(new PutCommand({
      TableName: d.tableVersions,
      Item: { docId, versionId, numero, type: 'auto', auteur: 'telechargement', creeLe: maintenant, seqEtat: seq, cleS3 },
    }));
    return numero;
  }

  // Une version existe déjà pour cet état (ou une autre instance est en train de la créer).
  let doc: Record<string, unknown> | undefined;
  for (let essai = 0; essai < 5; essai++) {
    doc = (await d.ddb.send(new GetCommand({ TableName: d.tableDocuments, Key: { docId }, ConsistentRead: true }))).Item;
    if (!doc) throw new Error(`document ${docId} introuvable`);
    if (doc.derniereVersionSeq === seq && typeof doc.derniereVersionNumero === 'string') return doc.derniereVersionNumero;
    if (doc.derniereVersionSeq !== seq) break;
    await pause(100);
  }
  return numeroVersion(Number(doc?.versionMajeure ?? 0), Number(doc?.versionMineure ?? 0));
}

/** PDF de base de l'état courant : réutilisé s'il existe, sinon généré et rangé dans S3. */
export async function pdfDeBase(d: DepsDocument, docId: string, titre: string, maintenant: number): Promise<{ pdf: Uint8Array; numero: string }> {
  const { ydoc, seq } = await reconstruire(d, docId);
  const cle = `pdf/${docId}/${seq}.pdf`;
  const existant = await lireObjet(d.s3, d.bucket, cle);
  if (existant?.meta['numero-version']) return { pdf: existant.corps, numero: existant.meta['numero-version'] };

  const numero = await numeroPourEtat(d, docId, seq, ydoc, maintenant);
  const pdf = await genererPdfBase(titre, yjsVersBlocs(ydoc));
  await d.s3.send(new PutObjectCommand({
    Bucket: d.bucket, Key: cle, Body: pdf, ContentType: 'application/pdf', Metadata: { 'numero-version': numero },
  }));
  return { pdf, numero };
}

// Dernière version numérotée du document (D-012), reconstruction de l'état courant au besoin, PDF de base en cache S3.
import * as Y from 'yjs';
import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  FORMAT_VERSION_DEFAUT, estFormatVersion, incrementer, msDuSeq, nouveauSeq, numeroVersion, profondeur, yjsVersBlocs, type FormatVersion,
} from '@b-synctext/commun';
import { genererPdf } from './pdf.js';
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

function formatDe(doc: Record<string, unknown> | undefined): FormatVersion {
  return estFormatVersion(doc?.formatVersion) ? doc.formatVersion : FORMAT_VERSION_DEFAUT;
}
const niveauxDe = (doc: Record<string, unknown> | undefined): number[] =>
  [Number(doc?.niv1 ?? 0), Number(doc?.niv2 ?? 0), Number(doc?.niv3 ?? 0)];

/** Version automatique de l'état `seq` s'il n'en a pas encore (dernier chiffre du format, D-011). */
export async function numeroPourEtat(
  d: DepsDocument, docId: string, seq: string, ydoc: Y.Doc, maintenant: number,
): Promise<{ numero: string; versionId?: string }> {
  const avant = (await d.ddb.send(new GetCommand({ TableName: d.tableDocuments, Key: { docId }, ConsistentRead: true }))).Item;
  if (!avant) throw new Error(`document ${docId} introuvable`);
  const format = formatDe(avant);
  const k = profondeur(format);
  let gagne: Record<string, unknown> | undefined;
  try {
    const r = await d.ddb.send(new UpdateCommand({
      TableName: d.tableDocuments,
      Key: { docId },
      UpdateExpression: `ADD niv${k} :un SET derniereVersionSeq = :seq`,
      ConditionExpression: 'attribute_exists(docId) AND (attribute_not_exists(derniereVersionSeq) OR derniereVersionSeq <> :seq)',
      ExpressionAttributeValues: { ':un': 1, ':seq': seq },
      ReturnValues: 'ALL_NEW',
    }));
    gagne = r.Attributes;
  } catch (e) {
    if (!estRefusCondition(e)) throw e;
  }

  if (gagne) {
    const numero = numeroVersion(format, niveauxDe(gagne));
    const versionId = nouveauSeq(maintenant);
    const cleS3 = `versions/${docId}/${versionId}.bin`;
    await d.s3.send(new PutObjectCommand({ Bucket: d.bucket, Key: cleS3, Body: Y.encodeStateAsUpdate(ydoc), ContentType: 'application/octet-stream' }));
    await d.ddb.send(new PutCommand({
      TableName: d.tableVersions,
      Item: { docId, versionId, numero, type: 'auto', auteur: 'telechargement', auteurs: ['telechargement'], creeLe: maintenant, seqEtat: seq, cleS3 },
    }));
    await d.ddb.send(new UpdateCommand({
      TableName: d.tableDocuments,
      Key: { docId },
      UpdateExpression: 'SET derniereVersionNumero = :num, derniereVersionId = :id',
      ConditionExpression: 'derniereVersionSeq = :seq',
      ExpressionAttributeValues: { ':num': numero, ':id': versionId, ':seq': seq },
    })).catch((e) => { if (!estRefusCondition(e)) throw e; });
    return { numero, versionId };
  }

  // Une version existe déjà pour cet état (ou une autre instance est en train de la créer).
  let doc: Record<string, unknown> | undefined;
  for (let essai = 0; essai < 5; essai++) {
    doc = (await d.ddb.send(new GetCommand({ TableName: d.tableDocuments, Key: { docId }, ConsistentRead: true }))).Item;
    if (!doc) throw new Error(`document ${docId} introuvable`);
    if (doc.derniereVersionSeq === seq && typeof doc.derniereVersionNumero === 'string') {
      return { numero: doc.derniereVersionNumero, versionId: typeof doc.derniereVersionId === 'string' ? doc.derniereVersionId : undefined };
    }
    if (doc.derniereVersionSeq !== seq) break;
    await pause(100);
  }
  return { numero: numeroVersion(formatDe(doc), niveauxDe(doc)) };
}

/**
 * PDF de base : la **dernière version numérotée** du document (D-012). S'il n'y a encore aucune version,
 * l'état courant est capturé en version automatique, puis servi. Un PDF par version, en cache S3.
 */
export async function pdfDeBase(d: DepsDocument, docId: string, titre: string, maintenant: number): Promise<{ pdf: Uint8Array; numero: string }> {
  const doc = (await d.ddb.send(new GetCommand({ TableName: d.tableDocuments, Key: { docId }, ConsistentRead: true }))).Item;
  if (!doc) throw new Error(`document ${docId} introuvable`);
  let versionId = typeof doc.derniereVersionId === 'string' ? doc.derniereVersionId : undefined;
  let numero = typeof doc.derniereVersionNumero === 'string' ? doc.derniereVersionNumero : undefined;
  let etat: Uint8Array | undefined;
  if (versionId && numero) {
    const v = (await d.ddb.send(new GetCommand({ TableName: d.tableVersions, Key: { docId, versionId } }))).Item;
    if (typeof v?.cleS3 === 'string') etat = (await lireObjet(d.s3, d.bucket, v.cleS3))?.corps;
  }
  if (!etat) {
    const { ydoc, seq } = await reconstruire(d, docId);
    const r = await numeroPourEtat(d, docId, seq, ydoc, maintenant);
    numero = r.numero;
    versionId = r.versionId ?? seq;
    etat = Y.encodeStateAsUpdate(ydoc);
  }
  const cle = `pdf/${docId}/${versionId}.pdf`;
  const existant = await lireObjet(d.s3, d.bucket, cle);
  if (existant?.meta['numero-version']) return { pdf: existant.corps, numero: existant.meta['numero-version'] };

  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, etat);
  const pdf = await genererPdf(yjsVersBlocs(ydoc), { titre, numeroVersion: numero! });
  await d.s3.send(new PutObjectCommand({
    Bucket: d.bucket, Key: cle, Body: pdf, ContentType: 'application/pdf', Metadata: { 'numero-version': numero! },
  }));
  return { pdf, numero: numero! };
}

// Versions (H-06) : instantanés S3 numérotés, et restauration par une nouvelle modification.
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { FORMAT_VERSION_DEFAUT, estFormatVersion, incrementer, nouveauSeq, numeroVersion, type FormatVersion } from '@b-synctext/commun';
import * as Y from 'yjs';
import { estConditionRefusee, expireDans, type Dependances } from './dependances.js';
import { lireObjet } from './persistance.js';

export type TypeVersion = 'auto' | 'manuelle' | 'restauration';

export interface DemandeVersion {
  docId: string;
  etat: Uint8Array;
  type: TypeVersion;
  auteur: string;
  auteurs?: string[];
  nom?: string;
  /** Chiffre à incrémenter (1 = premier) pour une version manuelle ; défaut : le dernier (D-011). */
  niveau?: number;
  /** seq du journal couvert par cet état. */
  seqEtat: string;
}

export interface VersionCreee {
  versionId: string;
  numero: string;
}

/**
 * Numéro suivant (D-011) : le chiffre `niveau` +1, les chiffres à droite à 0, en une écriture atomique.
 * Une version automatique ou une restauration incrémente le dernier chiffre du format.
 */
async function numeroter(d: Dependances, docId: string, type: TypeVersion, niveau?: number): Promise<{ numero: string; niveaux: number[] }> {
  const lu = await d.ddb.send(new GetCommand({ TableName: d.tables.documents, Key: { docId }, ConsistentRead: true }));
  if (!lu.Item) throw new Error(`document ${docId} introuvable`);
  const format: FormatVersion = estFormatVersion(lu.Item.formatVersion) ? lu.Item.formatVersion : FORMAT_VERSION_DEFAUT;
  const actuels = [Number(lu.Item.niv1 ?? 0), Number(lu.Item.niv2 ?? 0), Number(lu.Item.niv3 ?? 0)];
  const voulus = incrementer(actuels, type === 'manuelle' ? niveau : undefined, format);
  const k = voulus.findIndex((v, i) => v !== actuels[i]) + 1;
  const zeros = [1, 2, 3].filter((i) => i > k).map((i) => `niv${i} = :zero`);
  const r = await d.ddb.send(
    new UpdateCommand({
      TableName: d.tables.documents,
      Key: { docId },
      UpdateExpression: `ADD niv${k} :un` + (zeros.length ? ` SET ${zeros.join(', ')}` : ''),
      ConditionExpression: 'attribute_exists(docId)',
      ExpressionAttributeValues: zeros.length ? { ':un': 1, ':zero': 0 } : { ':un': 1 },
      ReturnValues: 'ALL_NEW',
    }),
  );
  const niveaux = [Number(r.Attributes?.niv1 ?? 0), Number(r.Attributes?.niv2 ?? 0), Number(r.Attributes?.niv3 ?? 0)];
  return { numero: numeroVersion(format, niveaux), niveaux };
}

export async function creerVersion(d: Dependances, q: DemandeVersion): Promise<VersionCreee> {
  const m = d.maintenant();
  const versionId = nouveauSeq(m);
  const cleS3 = `versions/${q.docId}/${versionId}.bin`;
  // L'objet d'abord : une version listée a toujours son contenu.
  await d.s3.send(
    new PutObjectCommand({ Bucket: d.bucket, Key: cleS3, Body: q.etat, ContentType: 'application/octet-stream' }),
  );
  const { numero, niveaux } = await numeroter(d, q.docId, q.type, q.niveau);
  await d.ddb.send(
    new PutCommand({
      TableName: d.tables.versions,
      Item: {
        docId: q.docId,
        versionId,
        numero,
        nom: q.nom,
        type: q.type,
        auteur: q.auteur,
        auteurs: q.auteurs,
        creeLe: m,
        seqEtat: q.seqEtat,
        cleS3,
      },
    }),
  );
  // Dernière version connue du document (utile au PDF), si personne n'a numéroté entre-temps.
  try {
    await d.ddb.send(
      new UpdateCommand({
        TableName: d.tables.documents,
        Key: { docId: q.docId },
        UpdateExpression: 'SET derniereVersionSeq = :s, derniereVersionNumero = :num, derniereVersionId = :id',
        ConditionExpression: 'niv1 = :a AND niv2 = :b AND niv3 = :c',
        ExpressionAttributeValues: { ':s': q.seqEtat, ':num': numero, ':id': versionId, ':a': niveaux[0], ':b': niveaux[1], ':c': niveaux[2] },
      }),
    );
  } catch (e) {
    if (!estConditionRefusee(e)) throw e;
  }
  return { versionId, numero };
}

/** Limite de création manuelle : 1 par minute et par document. Renvoie false si dépassée. */
export async function autoriserVersionManuelle(d: Dependances, docId: string): Promise<boolean> {
  const m = d.maintenant();
  const r = await d.ddb.send(
    new UpdateCommand({
      TableName: d.tables.compteurs,
      Key: { cle: `version#${docId}#${Math.floor(m / 60_000)}` },
      UpdateExpression: 'ADD valeur :un SET #exp = :exp',
      ExpressionAttributeNames: { '#exp': 'expire' },
      ExpressionAttributeValues: { ':un': 1, ':exp': expireDans(m, 600) },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return Number(r.Attributes?.valeur ?? 0) <= 1;
}

/** État Yjs d'une version, ou undefined si elle n'existe pas pour ce document. */
export async function lireEtatVersion(d: Dependances, docId: string, versionId: string): Promise<Uint8Array | undefined> {
  const r = await d.ddb.send(new GetCommand({ TableName: d.tables.versions, Key: { docId, versionId } }));
  const cle = r.Item?.cleS3;
  if (typeof cle !== 'string') return undefined;
  return (await lireObjet(d, cle))?.octets;
}

/**
 * Mise à jour qui remplace le contenu courant par celui d'une version.
 * Calculée sur une copie : le document réel n'est touché qu'après l'écriture au journal.
 * L'historique n'est pas réécrit : c'est une modification de plus (C-2).
 */
export function calculerRestauration(ydoc: Y.Doc, etatVersion: Uint8Array, nomFragment = 'default'): Uint8Array {
  const copie = new Y.Doc();
  const source = new Y.Doc();
  try {
    Y.applyUpdate(copie, Y.encodeStateAsUpdate(ydoc));
    Y.applyUpdate(source, etatVersion);
    const avant = Y.encodeStateVector(copie);
    copie.transact(() => {
      const cible = copie.getXmlFragment(nomFragment);
      cible.delete(0, cible.length);
      const noeuds = source
        .getXmlFragment(nomFragment)
        .toArray()
        .filter((n): n is Y.XmlElement | Y.XmlText => n instanceof Y.XmlElement || n instanceof Y.XmlText)
        .map((n) => n.clone());
      cible.insert(0, noeuds);
    });
    return Y.encodeStateAsUpdate(copie, avant);
  } finally {
    copie.destroy();
    source.destroy();
  }
}

/** Rôle du rédacteur dans le document (lu à chaque action sensible). */
export async function lireRole(d: Dependances, docId: string, email: string): Promise<string | undefined> {
  const r = await d.ddb.send(new GetCommand({ TableName: d.tables.membres, Key: { docId, email }, ConsistentRead: true }));
  return r.Item?.role as string | undefined;
}

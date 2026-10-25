// Point d'entrée Lambda « api » (API Gateway HTTP API, payload v2).
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { yjsVersBlocs } from '@b-synctext/commun';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import * as Y from 'yjs';
import { traiter } from './app.js';
import { creerDonnees, creerSecrets, tablesDepuisEnv } from './donnees.js';
import type { Contexte } from './types.js';

let contexte: Contexte | undefined;

/** Construit le contexte au premier appel (clients AWS réutilisés entre invocations). */
function obtenirContexte(): Contexte {
  if (contexte) return contexte;
  const env = process.env;
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const bucket = env.BUCKET_DONNEES;
  const secretSession = env.PARAM_SECRET_SESSION;
  const codeAdmin = env.PARAM_CODE_ADMIN;
  if (!bucket || !secretSession || !codeAdmin) throw new Error('Configuration incomplète');
  contexte = {
    donnees: creerDonnees(db, new S3Client({}), bucket, tablesDepuisEnv(env)),
    secrets: creerSecrets(new SSMClient({}), secretSession, codeAdmin),
    maintenant: () => Date.now(),
    versBlocs: (etat) => {
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, etat);
      return yjsVersBlocs(ydoc);
    },
  };
  return contexte;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  const entetes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) entetes[k.toLowerCase()] = v;
  let corps = event.body;
  if (corps && event.isBase64Encoded) corps = Buffer.from(corps, 'base64').toString('utf8');

  let reponse;
  try {
    reponse = await traiter(obtenirContexte(), {
      methode: event.requestContext.http.method,
      chemin: event.rawPath,
      entetes,
      corps,
    });
  } catch {
    // Configuration cassée : message neutre, détail uniquement dans les journaux.
    console.error('initialisation impossible');
    reponse = { statut: 500, corps: { erreur: { code: 'erreur_interne', message: 'Une erreur est survenue.' } } };
  }
  return {
    statusCode: reponse.statut,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: reponse.corps === undefined ? '' : JSON.stringify(reponse.corps),
  };
};

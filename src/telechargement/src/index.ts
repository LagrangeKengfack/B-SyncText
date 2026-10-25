// Lambda « telechargement » : routes publiques des liens (HTTP API, payload v2).
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { nouvelId } from '@b-synctext/commun';
import { depotDynamo } from './depot.js';
import { pdfDeBase } from './document.js';
import { envoyeurSes } from './courriel.js';
import { tamponner } from './pdf.js';
import { type Ports, traiterDemande, traiterFichier, traiterLien } from './liens.js';
import { CacheEpuises, erreur, libelleExemplaire, trouverRoute } from './regles.js';

function env(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`variable d'environnement ${nom} manquante`);
  return v;
}

// Clients et cache au niveau du module : réutilisés d'une invocation à l'autre.
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const s3 = new S3Client({});
const ses = new SESv2Client({});
const cache = new CacheEpuises();
let ports: Ports | undefined;

function lesPorts(): Ports {
  if (ports) return ports;
  const deps = {
    ddb, s3,
    bucket: env('BUCKET_DONNEES'),
    tableJournal: env('TABLE_JOURNAL'),
    tableDocuments: env('TABLE_DOCUMENTS'),
    tableVersions: env('TABLE_VERSIONS'),
  };
  ports = {
    depot: depotDynamo(ddb, env('TABLE_LIENS'), env('TABLE_RESERVATIONS')),
    cache,
    maintenant: () => Date.now(),
    nouvelId,
    async produirePdf(lien, k, maintenant) {
      const { pdf, numero } = await pdfDeBase(deps, lien.docId, lien.titre, maintenant);
      void numero;
      return tamponner(pdf, libelleExemplaire(k, lien.n));
    },
    envoyerCourriel: envoyeurSes(ses, env('EMAIL_EXPEDITEUR')),
  };
  return ports;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  const methode = event.requestContext?.http?.method ?? 'GET';
  const route = trouverRoute(methode, event.rawPath ?? '');
  if (!route) return erreur(404, 'introuvable', 'Route inconnue.');
  try {
    const p = lesPorts();
    switch (route.route) {
      case 'lien': return await traiterLien(p, route.lienId);
      case 'demandes': return await traiterDemande(p, route.lienId);
      case 'fichier': return await traiterFichier(p, route.lienId, event.queryStringParameters?.ticket);
    }
  } catch (e) {
    console.error(`erreur sur ${methode} ${event.rawPath}`, e);
    return erreur(500, 'interne', 'Erreur interne.');
  }
};

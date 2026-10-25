// Point d'entrée du serveur d'édition (EC2, systemd) : lit la configuration et démarre Hocuspocus.
import { S3Client } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { lireConfig } from './config.js';
import { lecteurSecret } from './secrets.js';
import { creerServeur } from './serveur.js';

const config = lireConfig();
// Région et identifiants : profil d'instance de l'EC2 (aucune clé ici).
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});
const ssm = new SSMClient({});

// Une promesse rejetée non attendue ne doit pas arrêter le serveur de tous les rédacteurs.
process.on('unhandledRejection', (e) => console.error('rejet non traité', e));

const { serveur } = creerServeur({
  deps: { ddb, s3, tables: config.tables, bucket: config.bucket, maintenant: Date.now },
  secretOrigine: config.secretOrigine,
  secretSession: lecteurSecret(ssm, config.paramSecretSession),
  port: config.port,
});

await serveur.listen(config.port);
console.log(`serveur d'édition à l'écoute sur le port ${config.port} (WebSocket /collab, santé /sante)`);

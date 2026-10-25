// Dépendances injectées : clients AWS (vrais en production, faux en test) et horloge.
import type { Tables } from './config.js';

/** Tout client qui sait envoyer une commande du SDK v3 (DynamoDBDocumentClient, S3Client). */
export interface Client {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(commande: any): Promise<any>;
}

export interface Dependances {
  ddb: Client;
  s3: Client;
  tables: Tables;
  bucket: string;
  maintenant: () => number;
}

/** Une erreur de condition DynamoDB (écriture conditionnelle refusée). */
export function estConditionRefusee(e: unknown): boolean {
  return (e as { name?: string })?.name === 'ConditionalCheckFailedException';
}

/** Expiration TTL DynamoDB, en secondes. */
export function expireDans(maintenantMs: number, secondes: number): number {
  return Math.floor(maintenantMs / 1000) + secondes;
}

// Secret de signature des sessions, lu une fois dans SSM (SecureString) puis gardé en mémoire.
import { GetParameterCommand } from '@aws-sdk/client-ssm';
import type { Client } from './dependances.js';

export function lecteurSecret(ssm: Client, nomParametre: string): () => Promise<string> {
  let enCache: Promise<string> | undefined;
  return () => {
    enCache ??= ssm
      .send(new GetParameterCommand({ Name: nomParametre, WithDecryption: true }))
      .then((r: { Parameter?: { Value?: string } }) => {
        const valeur = r.Parameter?.Value;
        if (!valeur) throw new Error(`Paramètre SSM vide : ${nomParametre}`);
        return valeur;
      })
      .catch((e: unknown) => {
        enCache = undefined; // nouvel essai au prochain appel
        throw e;
      });
    return enCache;
  };
}

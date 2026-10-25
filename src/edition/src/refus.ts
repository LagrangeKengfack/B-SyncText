// Refus répétés (H-10) : compteur par rédacteur et par minute ; blocage de 15 min au 20e.
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DUREE_BLOCAGE_MS, SEUIL_REFUS } from '@b-synctext/commun';
import { estConditionRefusee, expireDans, type Dependances } from './dependances.js';

export interface ResultatRefus {
  refusDansLaMinute: number;
  /** Présent si ce refus déclenche un blocage. */
  bloqueJusqua?: number;
}

export async function enregistrerRefus(d: Dependances, email: string, raison: string): Promise<ResultatRefus> {
  const m = d.maintenant();
  const minute = Math.floor(m / 60_000);
  const r = await d.ddb.send(
    new UpdateCommand({
      TableName: d.tables.compteurs,
      Key: { cle: `refus#${email}#${minute}` },
      UpdateExpression: 'ADD valeur :un SET #exp = :exp',
      ExpressionAttributeNames: { '#exp': 'expire' },
      ExpressionAttributeValues: { ':un': 1, ':exp': expireDans(m, 600) },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  const refusDansLaMinute = Number(r.Attributes?.valeur ?? 0);
  if (refusDansLaMinute < SEUIL_REFUS) return { refusDansLaMinute };

  const bloqueJusqua = m + DUREE_BLOCAGE_MS;
  try {
    await d.ddb.send(
      new UpdateCommand({
        TableName: d.tables.redacteurs,
        Key: { email },
        UpdateExpression: 'SET bloqueJusqua = :b, motifBlocage = :motif',
        ConditionExpression: 'attribute_exists(email)',
        ExpressionAttributeValues: {
          ':b': bloqueJusqua,
          ':motif': `${refusDansLaMinute} refus en 1 minute (dernier : ${raison})`,
        },
      }),
    );
  } catch (e) {
    if (!estConditionRefusee(e)) throw e;
  }
  return { refusDansLaMinute, bloqueJusqua };
}

/** Fin de blocage si le rédacteur est bloqué maintenant, sinon undefined. */
export async function lireBlocage(d: Dependances, email: string): Promise<number | undefined> {
  const r = await d.ddb.send(new GetCommand({ TableName: d.tables.redacteurs, Key: { email }, ConsistentRead: true }));
  const b = r.Item?.bloqueJusqua;
  return typeof b === 'number' && b > d.maintenant() ? b : undefined;
}

// Présence pour le tableau de bord : nombre de connectés et dernière modification.
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { estConditionRefusee, type Dependances } from './dependances.js';

export async function majPresence(d: Dependances, docId: string, connectes: number, modifie: boolean): Promise<void> {
  const m = d.maintenant();
  try {
    await d.ddb.send(
      new UpdateCommand({
        TableName: d.tables.documents,
        Key: { docId },
        UpdateExpression: modifie
          ? 'SET connectes = :c, presenceMaj = :m, modifieLe = :m'
          : 'SET connectes = :c, presenceMaj = :m',
        ConditionExpression: 'attribute_exists(docId)',
        ExpressionAttributeValues: { ':c': connectes, ':m': m },
      }),
    );
  } catch (e) {
    if (!estConditionRefusee(e)) throw e;
  }
}

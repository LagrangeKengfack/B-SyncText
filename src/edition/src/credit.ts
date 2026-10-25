// Crédit d'écriture du jour (C-4) : un élément par rédacteur et par jour WAT,
// débité par une écriture conditionnelle ; créé implicitement à 10 000.
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CREDIT_JOURNALIER, jourWat, prochaineRecharge } from '@b-synctext/commun';
import { estConditionRefusee, expireDans, type Dependances } from './dependances.js';

export interface EtatCredit {
  restant: number;
  rechargeA: number;
}

export interface ResultatDebit extends EtatCredit {
  accepte: boolean;
}

/** Crédit restant du jour (lecture forte), 10 000 si aucun élément. */
export async function lireCredit(d: Dependances, email: string): Promise<EtatCredit> {
  const m = d.maintenant();
  const r = await d.ddb.send(
    new GetCommand({ TableName: d.tables.credits, Key: { email, jour: jourWat(m) }, ConsistentRead: true }),
  );
  const restant = typeof r.Item?.restant === 'number' ? r.Item.restant : CREDIT_JOURNALIER;
  return { restant, rechargeA: prochaineRecharge(m) };
}

/** Débite n caractères, ou refuse en entier (H-04). */
export async function debiterCredit(d: Dependances, email: string, n: number): Promise<ResultatDebit> {
  const m = d.maintenant();
  const rechargeA = prochaineRecharge(m);
  // Plus que le crédit d'une journée : refusé sans écrire (sinon la création implicite passerait sous zéro).
  if (n > CREDIT_JOURNALIER) return { accepte: false, ...(await lireCredit(d, email)) };
  try {
    const r = await d.ddb.send(
      new UpdateCommand({
        TableName: d.tables.credits,
        Key: { email, jour: jourWat(m) },
        UpdateExpression: 'SET restant = if_not_exists(restant, :max) - :n, #exp = if_not_exists(#exp, :exp)',
        ConditionExpression: 'attribute_not_exists(restant) OR restant >= :n',
        ExpressionAttributeNames: { '#exp': 'expire' },
        ExpressionAttributeValues: { ':max': CREDIT_JOURNALIER, ':n': n, ':exp': expireDans(m, 2 * 86_400) },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    return { accepte: true, restant: Number(r.Attributes?.restant ?? 0), rechargeA };
  } catch (e) {
    if (!estConditionRefusee(e)) throw e;
    return { accepte: false, ...(await lireCredit(d, email)) };
  }
}

/** Rend un débit quand l'écriture du journal a échoué (la modification n'est pas acceptée). */
export async function rembourserCredit(d: Dependances, email: string, n: number, jour: string): Promise<void> {
  try {
    await d.ddb.send(
      new UpdateCommand({
        TableName: d.tables.credits,
        Key: { email, jour },
        UpdateExpression: 'ADD restant :n',
        ConditionExpression: 'attribute_exists(restant)',
        ExpressionAttributeValues: { ':n': n },
      }),
    );
  } catch (e) {
    console.error('remboursement du crédit impossible', email, n, e);
  }
}

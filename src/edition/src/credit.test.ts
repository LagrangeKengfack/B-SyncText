import { describe, expect, it } from 'vitest';
import { CREDIT_JOURNALIER, jourWat, prochaineRecharge } from '@b-synctext/commun';
import { debiterCredit, lireCredit, rembourserCredit } from './credit.js';
import { fauxDeps } from './faux-aws.js';

describe('crédit du jour (C-4)', () => {
  it('crée implicitement le crédit à 10 000 puis débite', async () => {
    const { deps, ddb, horloge } = fauxDeps();
    const r = await debiterCredit(deps, 'a@x.fr', 7);
    expect(r).toEqual({ accepte: true, restant: CREDIT_JOURNALIER - 7, rechargeA: prochaineRecharge(horloge.ms) });
    const item = ddb.get('Credits', { email: 'a@x.fr', jour: jourWat(horloge.ms) });
    expect(item?.restant).toBe(9_993);
    expect(typeof item?.expire).toBe('number');
  });

  it('utilise l’écriture conditionnelle du contrat', async () => {
    const { deps, ddb } = fauxDeps();
    await debiterCredit(deps, 'a@x.fr', 3);
    const cmd = ddb.commandes.find((c) => c.nom === 'UpdateCommand')!;
    expect(cmd.input.UpdateExpression).toContain('SET restant = if_not_exists(restant, :max) - :n');
    expect(cmd.input.ConditionExpression).toBe('attribute_not_exists(restant) OR restant >= :n');
  });

  it('refuse en entier une insertion plus longue que le crédit restant (H-04)', async () => {
    const { deps, ddb, horloge } = fauxDeps();
    ddb.put('Credits', { email: 'a@x.fr', jour: jourWat(horloge.ms), restant: 100 });
    const r = await debiterCredit(deps, 'a@x.fr', 500);
    expect(r.accepte).toBe(false);
    expect(r.restant).toBe(100);
    expect(ddb.get('Credits', { email: 'a@x.fr', jour: jourWat(horloge.ms) })?.restant).toBe(100);
  });

  it('refuse sans écrire au-delà d’une journée de crédit', async () => {
    const { deps, ddb, horloge } = fauxDeps();
    const r = await debiterCredit(deps, 'a@x.fr', CREDIT_JOURNALIER + 1);
    expect(r.accepte).toBe(false);
    expect(r.restant).toBe(CREDIT_JOURNALIER);
    expect(ddb.get('Credits', { email: 'a@x.fr', jour: jourWat(horloge.ms) })).toBeUndefined();
  });

  it('plusieurs appareils : jamais plus que le crédit', async () => {
    const { deps } = fauxDeps();
    const resultats = await Promise.all(Array.from({ length: 30 }, () => debiterCredit(deps, 'a@x.fr', 400)));
    expect(resultats.filter((r) => r.accepte)).toHaveLength(25);
    expect((await lireCredit(deps, 'a@x.fr')).restant).toBe(0);
  });

  it('un nouveau jour WAT recharge le crédit', async () => {
    const { deps, horloge } = fauxDeps();
    await debiterCredit(deps, 'a@x.fr', 10_000);
    expect((await debiterCredit(deps, 'a@x.fr', 1)).accepte).toBe(false);
    horloge.ms = prochaineRecharge(horloge.ms);
    expect((await debiterCredit(deps, 'a@x.fr', 1)).accepte).toBe(true);
  });

  it('rembourse un débit dont le journal a échoué', async () => {
    const { deps, horloge } = fauxDeps();
    await debiterCredit(deps, 'a@x.fr', 50);
    await rembourserCredit(deps, 'a@x.fr', 50, jourWat(horloge.ms));
    expect((await lireCredit(deps, 'a@x.fr')).restant).toBe(CREDIT_JOURNALIER);
  });
});

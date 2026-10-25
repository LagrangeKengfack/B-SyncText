import { describe, expect, it } from 'vitest';
import { DUREE_BLOCAGE_MS, SEUIL_REFUS } from '@b-synctext/commun';
import { fauxDeps } from './faux-aws.js';
import { enregistrerRefus, lireBlocage } from './refus.js';

describe('refus répétés et blocage (H-10)', () => {
  it('bloque 15 minutes au 20e refus dans la minute', async () => {
    const { deps, ddb, horloge } = fauxDeps();
    ddb.put('Redacteurs', { email: 'a@x.fr', nom: 'A', creeLe: 0 });
    for (let i = 1; i < SEUIL_REFUS; i++) {
      expect((await enregistrerRefus(deps, 'a@x.fr', 'credit')).bloqueJusqua).toBeUndefined();
    }
    const r = await enregistrerRefus(deps, 'a@x.fr', 'credit');
    expect(r.refusDansLaMinute).toBe(SEUIL_REFUS);
    expect(r.bloqueJusqua).toBe(horloge.ms + DUREE_BLOCAGE_MS);
    const fiche = ddb.get('Redacteurs', { email: 'a@x.fr' });
    expect(fiche?.bloqueJusqua).toBe(horloge.ms + DUREE_BLOCAGE_MS);
    expect(fiche?.motifBlocage).toContain('refus');
    expect(await lireBlocage(deps, 'a@x.fr')).toBe(horloge.ms + DUREE_BLOCAGE_MS);
    horloge.ms += DUREE_BLOCAGE_MS + 1;
    expect(await lireBlocage(deps, 'a@x.fr')).toBeUndefined();
  });

  it('compte par minute : 19 refus puis 1 la minute suivante ne bloquent pas', async () => {
    const { deps, horloge } = fauxDeps(Date.UTC(2026, 9, 25, 10, 0, 0));
    for (let i = 0; i < 19; i++) await enregistrerRefus(deps, 'a@x.fr', 'credit');
    horloge.ms += 60_000;
    const r = await enregistrerRefus(deps, 'a@x.fr', 'credit');
    expect(r.refusDansLaMinute).toBe(1);
    expect(r.bloqueJusqua).toBeUndefined();
  });

  it('utilise la clé de compteur du contrat', async () => {
    const { deps, ddb, horloge } = fauxDeps();
    await enregistrerRefus(deps, 'a@x.fr', 'taille');
    expect(ddb.get('Compteurs', { cle: `refus#a@x.fr#${Math.floor(horloge.ms / 60_000)}` })?.valeur).toBe(1);
  });
});

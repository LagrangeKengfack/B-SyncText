import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { fauxDeps } from './faux-aws.js';
import { docInitial, majDe, texte, zoneTexte } from './outils-test.js';
import { autoriserVersionManuelle, calculerRestauration, creerVersion, lireEtatVersion } from './versions.js';

function avecDocument() {
  const env = fauxDeps();
  env.ddb.put('Documents', { docId: 'doc1', titre: 'T', versionMajeure: 0, versionMineure: 0 });
  return env;
}

describe('versions (H-06)', () => {
  it('numérote v0.1, v1, v1.1, v2 et garde l’état dans S3', async () => {
    const { deps, ddb, s3 } = avecDocument();
    const etat = Y.encodeStateAsUpdate(docInitial());
    const base = { docId: 'doc1', etat, auteur: 'a@x.fr', seqEtat: '0000000000001#abcdef' };
    const numeros = [];
    for (const type of ['auto', 'manuelle', 'auto', 'restauration'] as const) {
      numeros.push((await creerVersion(deps, { ...base, type })).numero);
    }
    expect(numeros).toEqual(['v0.1', 'v1', 'v1.1', 'v2']);
    const versions = ddb.items('Versions');
    expect(versions).toHaveLength(4);
    expect(versions[1]).toMatchObject({ type: 'manuelle', auteur: 'a@x.fr', seqEtat: base.seqEtat });
    expect(s3.objets.has(String(versions[0]!.cleS3))).toBe(true);
    expect(ddb.get('Documents', { docId: 'doc1' })).toMatchObject({ derniereVersionNumero: 'v2', derniereVersionSeq: base.seqEtat });
    expect(await lireEtatVersion(deps, 'doc1', String(versions[0]!.versionId))).toEqual(etat);
  });

  it('limite la création manuelle à une par minute et par document', async () => {
    const { deps, horloge } = avecDocument();
    expect(await autoriserVersionManuelle(deps, 'doc1')).toBe(true);
    expect(await autoriserVersionManuelle(deps, 'doc1')).toBe(false);
    expect(await autoriserVersionManuelle(deps, 'doc2')).toBe(true);
    horloge.ms += 60_000;
    expect(await autoriserVersionManuelle(deps, 'doc1')).toBe(true);
  });

  it('restauration : une modification de plus qui remet le contenu, appliquée chez tous', () => {
    const serveur = docInitial();
    zoneTexte(serveur).insert(0, 'version un');
    const etatV1 = Y.encodeStateAsUpdate(serveur);
    zoneTexte(serveur).delete(0, 10);
    zoneTexte(serveur).insert(0, 'texte actuel');
    const autre = new Y.Doc();
    Y.applyUpdate(autre, Y.encodeStateAsUpdate(serveur));

    const maj = calculerRestauration(serveur, etatV1);
    expect(texte(serveur)).toBe('texte actuel'); // pas touché avant journalisation
    Y.applyUpdate(serveur, maj);
    Y.applyUpdate(autre, maj);
    expect(texte(serveur)).toBe('version un');
    expect(texte(autre)).toBe('version un');
    // L'historique n'est pas réécrit : une écriture concurrente reste fusionnable.
    const enRetard = new Y.Doc();
    Y.applyUpdate(enRetard, etatV1);
    const m2 = majDe(enRetard, () => zoneTexte(enRetard).insert(0, '>'));
    Y.applyUpdate(serveur, m2);
    Y.applyUpdate(autre, m2);
    expect(texte(serveur)).toBe(texte(autre));
  });
});

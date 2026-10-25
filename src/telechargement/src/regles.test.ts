import { describe, expect, it } from 'vitest';
import {
  CacheEpuises, courrielEpuise, estErreurDebit, estRefusCondition, nomFichier, libelleExemplaire, trouverRoute,
} from './regles.js';

const L = 'a'.repeat(22);

describe('routes', () => {
  it('reconnaît les trois routes, avec ou sans /api', () => {
    expect(trouverRoute('GET', `/api/liens/${L}`)).toEqual({ route: 'lien', lienId: L });
    expect(trouverRoute('POST', `/api/liens/${L}/demandes`)).toEqual({ route: 'demandes', lienId: L });
    expect(trouverRoute('GET', `/liens/${L}/fichier`)).toEqual({ route: 'fichier', lienId: L });
  });
  it('refuse le reste', () => {
    expect(trouverRoute('POST', `/api/liens/${L}`)).toBeNull();
    expect(trouverRoute('GET', `/api/liens/${L}/demandes`)).toBeNull();
    expect(trouverRoute('GET', '/api/documents')).toBeNull();
  });
});

describe('erreurs DynamoDB', () => {
  it('débit et conflits', () => {
    expect(estErreurDebit({ name: 'ProvisionedThroughputExceededException' })).toBe(true);
    expect(estErreurDebit({ name: 'ThrottlingException' })).toBe(true);
    expect(estErreurDebit({ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'TransactionConflict' }] })).toBe(true);
    expect(estErreurDebit({ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }] })).toBe(false);
    expect(estErreurDebit(new Error('x'))).toBe(false);
    expect(estErreurDebit(null)).toBe(false);
  });
  it('refus de condition', () => {
    expect(estRefusCondition({ name: 'ConditionalCheckFailedException' })).toBe(true);
    expect(estRefusCondition({ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }] })).toBe(true);
    expect(estRefusCondition({ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'ThrottlingError' }] })).toBe(false);
    expect(estRefusCondition(undefined)).toBe(false);
  });
});

describe('textes', () => {
  it('libellé d\'exemplaire du pied de page', () => {
    expect(libelleExemplaire(137, 500)).toBe('Exemplaire 137 / 500');
  });
  it('nom de fichier sans accents ni caractères gênants', () => {
    expect(nomFichier('Été "2026" / plan', 4)).toBe('Ete-2026-plan-exemplaire-4.pdf');
    expect(nomFichier('???', 1)).toBe('document-exemplaire-1.pdf');
  });
  it('e-mail : titre, N, date WAT, aucune adresse', () => {
    const { sujet, texte } = courrielEpuise('Rapport', 500, Date.UTC(2026, 9, 25, 9, 30), 'Ama');
    expect(sujet).toContain('Rapport');
    expect(texte).toContain('Bonjour Ama');
    expect(texte).toContain('500 exemplaires');
    expect(texte).toContain('25/10/2026 10:30');
    expect(texte).not.toMatch(/https?:/);
    expect(courrielEpuise('X', 1, 0).texte).toContain('1 exemplaire a été');
  });
});

describe('cache des liens épuisés', () => {
  it('borné en taille', () => {
    const c = new CacheEpuises(2);
    c.ajouter('a', 'A', 1); c.ajouter('b', 'B', 1); c.ajouter('c', 'C', 1);
    expect(c.lire('a')).toBeUndefined();
    expect(c.lire('c')).toEqual({ titre: 'C', n: 1 });
  });
});

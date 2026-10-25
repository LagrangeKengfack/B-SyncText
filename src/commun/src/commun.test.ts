import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CREDIT_JOURNALIER, DUREE_BLOCAGE_MS, DUREE_JETON_MS, SEUIL_REFUS,
  dateHeureWat, estEmailValide, estProprietaire, jourWat, msDuSeq, normaliserEmail, nouveauSeq, nouvelId,
  numeroVersion, peutRenoncer, peutRetirerRole, prochaineRecharge, signerJeton, successeurPrincipal, verifierJeton,
} from './index.js';

describe('constantes', () => {
  it('valeurs du contrat', () => {
    expect(CREDIT_JOURNALIER).toBe(10_000);
    expect(SEUIL_REFUS).toBe(20);
    expect(DUREE_BLOCAGE_MS).toBe(15 * 60_000);
  });
});

describe('jour WAT et recharge', () => {
  it('23h30 UTC est déjà le lendemain en WAT', () => {
    expect(jourWat(Date.UTC(2026, 9, 25, 23, 30))).toBe('2026-10-26');
    expect(jourWat(Date.UTC(2026, 9, 25, 22, 59))).toBe('2026-10-25');
  });
  it('prochaine recharge = minuit WAT suivant (23h00 UTC)', () => {
    expect(prochaineRecharge(Date.UTC(2026, 9, 25, 10, 0))).toBe(Date.UTC(2026, 9, 25, 23, 0));
    expect(prochaineRecharge(Date.UTC(2026, 9, 25, 23, 0))).toBe(Date.UTC(2026, 9, 26, 23, 0));
    expect(prochaineRecharge(Date.UTC(2026, 9, 25, 22, 59, 59, 999))).toBe(Date.UTC(2026, 9, 25, 23, 0));
  });
  it('date et heure WAT lisibles', () => {
    expect(dateHeureWat(Date.UTC(2026, 9, 25, 23, 5))).toBe('26/10/2026 00:05');
  });
  it('valeurs par défaut sur maintenant', () => {
    expect(jourWat()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(prochaineRecharge()).toBeGreaterThan(Date.now());
    expect(dateHeureWat()).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
});

describe('identifiants', () => {
  it('nouvelId : 22 caractères base64url, distincts', () => {
    const a = nouvelId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(nouvelId()).not.toBe(a);
  });
  it('nouveauSeq : horodatage triable', () => {
    const s = nouveauSeq(1234);
    expect(s).toMatch(/^0000000001234#[A-Za-z0-9_-]{6}$/);
    expect(msDuSeq(s)).toBe(1234);
    expect(nouveauSeq(Date.UTC(2026, 0, 1)) < nouveauSeq(Date.UTC(2026, 0, 2))).toBe(true);
    expect(nouveauSeq()).toHaveLength(20);
  });
});

describe('e-mail', () => {
  it.each(['a@b.fr', ' Camille.Dupont@Exemple.ORG ', 'x+y@sous.domaine.com'])('valide : %s', (e) => {
    expect(estEmailValide(e)).toBe(true);
  });
  it.each(['', 'sansarobase', 'a@b', 'a b@c.fr', '@c.fr', 'a@.fr', 42, null, `${'a'.repeat(250)}@b.fr`])('invalide : %s', (e) => {
    expect(estEmailValide(e)).toBe(false);
  });
  it('normalise', () => {
    expect(normaliserEmail('  Camille@Exemple.FR ')).toBe('camille@exemple.fr');
  });
});

describe('jeton signé', () => {
  const secret = 'secret-de-test';
  const t0 = Date.UTC(2026, 9, 25, 12);

  it('valide : contenu rendu, exp à 7 jours', () => {
    const jeton = signerJeton({ email: 'a@b.fr', nom: 'Ama' }, secret, t0);
    const c = verifierJeton(jeton, secret, t0 + 1000);
    expect(c).toMatchObject({ email: 'a@b.fr', nom: 'Ama', exp: t0 + DUREE_JETON_MS });
  });
  it('exp fourni conservé ; défaut sur maintenant', () => {
    expect(verifierJeton(signerJeton({ exp: t0 + 5 }, secret), secret, t0)?.exp).toBe(t0 + 5);
    expect(verifierJeton(signerJeton({ a: 1 }, secret), secret)).not.toBeNull();
  });
  it('expiré', () => {
    const jeton = signerJeton({ email: 'a@b.fr' }, secret, t0);
    expect(verifierJeton(jeton, secret, t0 + DUREE_JETON_MS)).toBeNull();
  });
  it('falsifié : contenu modifié, mauvaise clé, forme invalide', () => {
    const jeton = signerJeton({ email: 'a@b.fr' }, secret, t0);
    const [, sig] = jeton.split('.');
    const faux = Buffer.from(JSON.stringify({ email: 'pirate@b.fr', exp: t0 + DUREE_JETON_MS })).toString('base64url');
    expect(verifierJeton(`${faux}.${sig}`, secret, t0)).toBeNull();
    expect(verifierJeton(jeton, 'autre-secret', t0)).toBeNull();
    expect(verifierJeton(jeton + 'x', secret, t0)).toBeNull();
    expect(verifierJeton('a.b.c', secret, t0)).toBeNull();
    expect(verifierJeton(undefined, secret, t0)).toBeNull();
  });
  it('signé mais illisible ou sans exp', () => {
    const signe = (p: string) => `${p}.${createHmac('sha256', secret).update(p).digest('base64url')}`;
    expect(verifierJeton(signe('pasdujson'), secret, t0)).toBeNull();
    expect(verifierJeton(signe(Buffer.from('{"a":1}').toString('base64url')), secret, t0)).toBeNull();
  });
});

describe('numéros de version', () => {
  it('formes', () => {
    expect(numeroVersion(3, 0)).toBe('v3');
    expect(numeroVersion(3, 1)).toBe('v3.1');
    expect(numeroVersion(0, 1)).toBe('v0.1');
    expect(numeroVersion(12, 10)).toBe('v12.10');
  });
});

describe('rôles', () => {
  it('retirer le rôle : principal sur un propriétaire seulement', () => {
    expect(peutRetirerRole('principal', 'proprietaire')).toBe(true);
    expect(peutRetirerRole('proprietaire', 'proprietaire')).toBe(false);
    expect(peutRetirerRole('membre', 'proprietaire')).toBe(false);
    expect(peutRetirerRole('principal', 'principal')).toBe(false);
    expect(peutRetirerRole('principal', 'membre')).toBe(false);
  });
  it('renoncer : refusé au dernier propriétaire', () => {
    expect(peutRenoncer('proprietaire', 2)).toBe(true);
    expect(peutRenoncer('principal', 2)).toBe(true);
    expect(peutRenoncer('principal', 1)).toBe(false);
    expect(peutRenoncer('membre', 5)).toBe(false);
  });
  it('estProprietaire', () => {
    expect(estProprietaire('principal')).toBe(true);
    expect(estProprietaire('membre')).toBe(false);
    expect(estProprietaire(undefined)).toBe(false);
  });
  it('successeur : propriétaire nommé le plus anciennement', () => {
    const membres = [
      { email: 'p@x.fr', role: 'principal' as const, nommeLe: 1 },
      { email: 'b@x.fr', role: 'proprietaire' as const, nommeLe: 30 },
      { email: 'a@x.fr', role: 'proprietaire' as const, nommeLe: 20 },
      { email: 'm@x.fr', role: 'membre' as const, nommeLe: 5 },
    ];
    expect(successeurPrincipal(membres, 'p@x.fr')?.email).toBe('a@x.fr');
    expect(successeurPrincipal(membres.slice(0, 1), 'p@x.fr')).toBeUndefined();
  });
});

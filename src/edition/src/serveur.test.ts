// Test d'intégration : vrai serveur Hocuspocus + vrais clients HocuspocusProvider, AWS simulé.
import { afterEach, describe, expect, it } from 'vitest';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { jourWat, signerJeton } from '@b-synctext/commun';
import * as Y from 'yjs';
import { fauxDeps } from './faux-aws.js';
import { texte } from './outils-test.js';
import { creerServeur } from './serveur.js';

const SECRET_ORIGINE = 'origine-test';
const SECRET_SESSION = 'session-test';

async function attendre(condition: () => boolean, delai = 3000): Promise<void> {
  const fin = Date.now() + delai;
  while (!condition()) {
    if (Date.now() > fin) throw new Error('délai dépassé');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** WebSocket de Node avec l'en-tête secret, comme CloudFront l'ajoute. */
class WebSocketAvecEntete extends WebSocket {
  constructor(url: string) {
    super(url, { headers: { 'x-origine-secret': SECRET_ORIGINE } } as unknown as string[]);
  }
}

const aFermer: { destroy(): unknown }[] = [];
afterEach(async () => {
  for (const f of aFermer.splice(0)) await f.destroy();
});

async function demarrer(env = fauxDeps(Date.now())) {
  const { serveur } = creerServeur({
    deps: env.deps,
    secretOrigine: SECRET_ORIGINE,
    secretSession: async () => SECRET_SESSION,
    port: 0,
    arretSurSignaux: false,
  });
  await serveur.listen();
  aFermer.push(serveur);
  return { ...env, serveur, port: serveur.address.port };
}

function rediger(port: number, email: string, messages: Record<string, unknown>[] = []) {
  const document = new Y.Doc();
  let echecAuth = false;
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${port}/collab`,
    name: 'doc1',
    token: signerJeton({ email, nom: email }, SECRET_SESSION),
    document,
    WebSocketPolyfill: WebSocketAvecEntete,
    onStateless: ({ payload }) => messages.push(JSON.parse(payload)),
    onAuthenticationFailed: () => {
      echecAuth = true;
    },
  } as ConstructorParameters<typeof HocuspocusProvider>[0]);
  aFermer.push(provider);
  return { provider, document, messages, echecAuth: () => echecAuth };
}

function ecrire(doc: Y.Doc, chaine: string): void {
  const f = doc.getXmlFragment('default');
  doc.transact(() => {
    if (f.length === 0) {
      const p = new Y.XmlElement('paragraph');
      f.insert(0, [p]);
      p.insert(0, [new Y.XmlText()]);
    }
    const t = (f.get(0) as Y.XmlElement).get(0) as Y.XmlText;
    t.insert(t.length, chaine);
  });
}

describe('serveur d’édition (Hocuspocus réel)', () => {
  it('HTTP : /sante sans en-tête, 403 sans en-tête secret, WebSocket refusé sans en-tête', async () => {
    const { port } = await demarrer();
    expect((await fetch(`http://127.0.0.1:${port}/sante`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/collab`)).status).toBe(403);
    expect((await fetch(`http://127.0.0.1:${port}/x`, { headers: { 'x-origine-secret': SECRET_ORIGINE } })).status).toBe(404);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/collab`);
    const resultat = await new Promise<string>((r) => {
      ws.onopen = () => r('ouvert');
      ws.onerror = () => r('refuse');
    });
    expect(resultat).toBe('refuse');
  });

  it('accepte, journalise, diffuse ; refuse au-delà du crédit sans appliquer ; non-membre rejeté', async () => {
    const env = await demarrer();
    const { ddb, port, serveur } = env;
    for (const email of ['a@x.fr', 'b@x.fr']) ddb.put('Membres', { docId: 'doc1', email, role: 'membre' });
    ddb.put('Documents', { docId: 'doc1', versionMajeure: 0, versionMineure: 0 });

    const a = rediger(port, 'a@x.fr');
    await attendre(() => a.provider.isSynced);
    ecrire(a.document, 'bonjour');
    const docServeur = () => serveur.hocuspocus.documents.get('doc1')!;
    await attendre(() => texte(docServeur()) === 'bonjour');
    await attendre(() => a.messages.some((m) => m.type === 'credit'));
    expect(a.messages.find((m) => m.type === 'credit')).toMatchObject({ restant: 9_993 });
    expect(ddb.items('Journal').length).toBeGreaterThan(0);
    await attendre(() => !a.provider.hasUnsyncedChanges);

    const b = rediger(port, 'b@x.fr');
    await attendre(() => b.provider.isSynced && texte(b.document) === 'bonjour');

    // b n'a plus que 2 caractères : « xyz » est refusé en entier.
    ddb.put('Credits', { email: 'b@x.fr', jour: jourWat(env.horloge.ms), restant: 2 });
    ecrire(b.document, 'xyz');
    await attendre(() => b.messages.some((m) => m.type === 'refus'));
    expect(b.messages.find((m) => m.type === 'refus')).toMatchObject({ raison: 'credit', restant: 2 });
    await new Promise((r) => setTimeout(r, 200));
    expect(texte(docServeur())).toBe('bonjour');
    expect(texte(a.document)).toBe('bonjour');
    expect(ddb.get('Compteurs', { cle: `refus#b@x.fr#${Math.floor(env.horloge.ms / 60_000)}` })?.valeur).toBe(1);

    // Version manuelle par message sans état.
    a.provider.sendStateless(JSON.stringify({ type: 'creerVersion', nom: 'relu' }));
    await attendre(() => a.messages.some((m) => m.type === 'versionCreee'));
    expect(a.messages.find((m) => m.type === 'versionCreee')).toMatchObject({ numero: 'v1' });

    // Restauration refusée à un simple membre.
    a.provider.sendStateless(JSON.stringify({ type: 'restaurer', versionId: 'x' }));
    await attendre(() => a.messages.some((m) => m.type === 'erreur'));

    const c = rediger(port, 'c@x.fr');
    await attendre(() => c.echecAuth());
  });

  it('restauration par un propriétaire, diffusée à tous ; blocage au 20e refus', async () => {
    const env = await demarrer();
    const { ddb, port, serveur, horloge } = env;
    ddb.put('Membres', { docId: 'doc1', email: 'p@x.fr', role: 'principal' });
    ddb.put('Membres', { docId: 'doc1', email: 'm@x.fr', role: 'membre' });
    ddb.put('Redacteurs', { email: 'm@x.fr', nom: 'm' });
    ddb.put('Documents', { docId: 'doc1', versionMajeure: 0, versionMineure: 0 });
    const docServeur = () => serveur.hocuspocus.documents.get('doc1')!;

    const p = rediger(port, 'p@x.fr');
    await attendre(() => p.provider.isSynced);
    ecrire(p.document, 'avant');
    await attendre(() => texte(docServeur()) === 'avant');
    p.provider.sendStateless(JSON.stringify({ type: 'creerVersion', nom: 'v' }));
    await attendre(() => p.messages.some((m) => m.type === 'versionCreee'));
    const versionId = String(p.messages.find((m) => m.type === 'versionCreee')!.versionId);
    ecrire(p.document, ' puis');
    await attendre(() => texte(docServeur()) === 'avant puis');

    const m = rediger(port, 'm@x.fr');
    await attendre(() => m.provider.isSynced && texte(m.document) === 'avant puis');
    p.provider.sendStateless(JSON.stringify({ type: 'restaurer', versionId }));
    await attendre(() => texte(docServeur()) === 'avant' && texte(m.document) === 'avant');
    expect(ddb.items('Versions').some((v) => v.type === 'restauration')).toBe(true);

    // 19 refus déjà comptés cette minute : le suivant bloque m.
    ddb.put('Compteurs', { cle: `refus#m@x.fr#${Math.floor(horloge.ms / 60_000)}`, valeur: 19 });
    ddb.put('Credits', { email: 'm@x.fr', jour: jourWat(horloge.ms), restant: 0 });
    ecrire(m.document, '!');
    await attendre(() => m.messages.some((x) => x.raison === 'bloque'));
    expect(ddb.get('Redacteurs', { email: 'm@x.fr' })?.bloqueJusqua).toBeGreaterThan(horloge.ms);

    // Reconnecté, il est en lecture seule : ses écritures ne sont pas appliquées.
    const m2 = rediger(port, 'm@x.fr');
    await attendre(() => m2.messages.some((x) => x.raison === 'bloque'));
    ecrire(m2.document, 'interdit');
    await new Promise((r) => setTimeout(r, 200));
    expect(texte(docServeur())).toBe('avant');
  });

  it('redémarrage : un nouveau serveur reconstruit le document (S3 + journal)', async () => {
    const env = fauxDeps(Date.now());
    env.ddb.put('Membres', { docId: 'doc1', email: 'a@x.fr', role: 'principal' });
    env.ddb.put('Documents', { docId: 'doc1', versionMajeure: 0, versionMineure: 0 });
    const premier = await demarrer(env);
    const a = rediger(premier.port, 'a@x.fr');
    await attendre(() => a.provider.isSynced);
    ecrire(a.document, 'persistant');
    await attendre(() => texte(premier.serveur.hocuspocus.documents.get('doc1')!) === 'persistant');
    a.provider.destroy();
    await premier.serveur.destroy();
    // Au déchargement : état compacté et version automatique.
    expect(env.s3.objets.has('etats/doc1.bin')).toBe(true);
    expect(env.ddb.items('Versions').some((v) => v.type === 'auto')).toBe(true);

    const second = await demarrer(env);
    const b = rediger(second.port, 'a@x.fr');
    await attendre(() => b.provider.isSynced && texte(b.document) === 'persistant');
  });
});

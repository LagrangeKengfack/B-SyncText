// Serveur Hocuspocus : branchement des contrôles sur les crochets (hooks) de Hocuspocus 4.
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { Server, type Connection, type Document, type Extension } from '@hocuspocus/server';
import { nouveauSeq, verifierJeton } from '@b-synctext/commun';
import * as Y from 'yjs';
import { controlerMiseAJour, TAILLE_MAX_MAJ_OCTETS } from './controle.js';
import type { Dependances } from './dependances.js';
import { compacter, ecrireJournal, reconstruire } from './persistance.js';
import { majPresence } from './presence.js';
import { enregistrerRefus, lireBlocage } from './refus.js';
import { SuiviDocument } from './suivi.js';
import {
  autoriserVersionManuelle,
  calculerRestauration,
  creerVersion,
  lireEtatVersion,
  lireRole,
  type TypeVersion,
} from './versions.js';

export interface OptionsServeur {
  deps: Dependances;
  secretOrigine: string;
  secretSession: () => Promise<string>;
  port: number;
  /** Présence, compactage et versions auto sont vérifiés à ce rythme. */
  intervalleTicMs?: number;
  delaiCompactageMs?: number;
  delaiVersionAutoMs?: number;
  /** Arrêt propre sur SIGTERM/SIGINT (vrai en production). */
  arretSurSignaux?: boolean;
}

export interface ContexteConnexion {
  email: string;
  nom: string;
  bloqueJusqua?: number;
}

/** Erreur levée dans beforeSync : Hocuspocus n'applique pas la mise à jour et ferme la connexion du document. */
class ErreurRefus extends Error {
  code = 4205; // ResetConnection de Hocuspocus
  reason: string;
  constructor(raison: string) {
    super(`mise à jour refusée (${raison})`);
    this.reason = `refus-${raison}`;
  }
}

const DOC_ID_VALIDE = /^[A-Za-z0-9_-]{1,64}$/;

function chemin(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://local').pathname;
  } catch {
    return '';
  }
}

export function origineValide(req: IncomingMessage, attendu: string): boolean {
  const recu = req.headers['x-origine-secret'];
  if (typeof recu !== 'string' || !attendu) return false;
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

function envoyer(connection: Connection, message: Record<string, unknown>): void {
  connection.sendStateless(JSON.stringify(message));
}

export function creerServeur(o: OptionsServeur) {
  const d = o.deps;
  const intervalle = o.intervalleTicMs ?? 5_000;
  const delaiCompactage = o.delaiCompactageMs ?? 30_000;
  // Version automatique après ce délai de calme (aucune modification), D-011 / D-012.
  const delaiVersionAuto = o.delaiVersionAutoMs ?? 5_000;

  const suivis = new Map<string, SuiviDocument>();
  /** Rédacteurs bloqués connus de ce serveur (fin de blocage en ms). */
  const bloques = new Map<string, number>();
  /** seq acceptés par connexion, en attente d'application. */
  const enAttente = new WeakMap<Connection, string[]>();

  let serveur!: Server<ContexteConnexion>;

  function connexions(): Connection<ContexteConnexion>[] {
    const toutes: Connection<ContexteConnexion>[] = [];
    for (const doc of serveur.hocuspocus.documents.values()) toutes.push(...doc.getConnections());
    return toutes;
  }

  /** Passe en lecture seule toutes les connexions d'un rédacteur qui vient d'être bloqué. */
  function bloquer(email: string, fin: number): void {
    bloques.set(email, fin);
    for (const c of connexions()) {
      if (c.context?.email !== email) continue;
      c.readOnly = true;
      c.context.bloqueJusqua = fin;
      envoyer(c, { type: 'refus', raison: 'bloque', bloqueJusqua: fin });
    }
  }

  function finBlocage(ctx: ContexteConnexion): number {
    return Math.max(ctx.bloqueJusqua ?? 0, bloques.get(ctx.email) ?? 0);
  }

  async function compacterDocument(docId: string, doc: Document, suivi: SuiviDocument): Promise<void> {
    // seq calculé avant l'encodage, sans attente entre les deux.
    const seq = suivi.seqEtat();
    const etat = Y.encodeStateAsUpdate(doc);
    suivi.modifieDepuisCompactage = false;
    suivi.derniereCompactage = d.maintenant();
    try {
      await compacter(d, docId, etat, seq);
    } catch (e) {
      suivi.modifieDepuisCompactage = true;
      throw e;
    }
  }

  async function versionDocument(
    docId: string,
    doc: Document,
    suivi: SuiviDocument,
    type: TypeVersion,
    auteur: string,
    nom?: string,
    niveau?: number,
  ) {
    const seqEtat = suivi.seqEtat();
    const etat = Y.encodeStateAsUpdate(doc);
    const auteurs = [...suivi.auteursDepuisVersion];
    const modifie = suivi.modifieDepuisVersion;
    suivi.modifieDepuisVersion = false;
    suivi.auteursDepuisVersion = new Set();
    suivi.derniereVersionAuto = d.maintenant();
    try {
      return await creerVersion(d, { docId, etat, type, auteur, auteurs, nom, niveau, seqEtat });
    } catch (e) {
      suivi.modifieDepuisVersion ||= modifie;
      for (const a of auteurs) suivi.auteursDepuisVersion.add(a);
      throw e;
    }
  }

  /** Restauration : version « restauration » de l'état courant, puis remplacement du contenu, persisté avant diffusion. */
  async function restaurer(connection: Connection<ContexteConnexion>, doc: Document, suivi: SuiviDocument, versionId: string) {
    const docId = doc.name;
    const email = connection.context.email;
    if (connection.readOnly) return envoyer(connection, { type: 'erreur', message: 'Rédacteur bloqué.' });
    const role = await lireRole(d, docId, email);
    if (role !== 'principal' && role !== 'proprietaire') {
      return envoyer(connection, { type: 'erreur', message: 'Seul un propriétaire peut restaurer.' });
    }
    const etatVersion = await lireEtatVersion(d, docId, versionId);
    if (!etatVersion) return envoyer(connection, { type: 'erreur', message: 'Version introuvable.' });

    await suivi.executerSeul(async () => {
      const avant = await versionDocument(docId, doc, suivi, 'restauration', email);
      const maj = calculerRestauration(doc, etatVersion);
      const origine = { source: 'local' as const, context: { restauration: versionId } };
      if (maj.byteLength <= TAILLE_MAX_MAJ_OCTETS) {
        const seq = nouveauSeq(d.maintenant());
        suivi.debutEcriture(seq);
        try {
          await ecrireJournal(d, { docId, seq, maj, auteur: email, caracteres: 0 });
          suivi.noterAcceptee(seq, email, d.maintenant());
          Y.applyUpdate(doc, maj, origine);
        } finally {
          suivi.finEcriture(seq);
        }
      } else {
        // Trop gros pour un élément du journal : l'état restauré est compacté dans S3 avant d'être appliqué.
        const seq = suivi.seqEtat();
        const copie = new Y.Doc();
        Y.applyUpdate(copie, Y.encodeStateAsUpdate(doc));
        Y.applyUpdate(copie, maj);
        const etat = Y.encodeStateAsUpdate(copie);
        copie.destroy();
        await compacter(d, docId, etat, seq);
        Y.applyUpdate(doc, maj, origine);
        suivi.modifieDepuisVersion = true;
        suivi.modifieDepuisPresence = true;
        suivi.auteursDepuisVersion.add(email);
      }
      envoyer(connection, { type: 'versionCreee', numero: avant.numero, versionId: avant.versionId, restauration: true });
    });
  }

  async function creerVersionManuelle(connection: Connection<ContexteConnexion>, doc: Document, suivi: SuiviDocument, nom: unknown, niveau: unknown) {
    const libelle = typeof nom === 'string' ? nom.trim().slice(0, 120) : '';
    const chiffre = typeof niveau === 'number' ? niveau : undefined;
    if (!(await autoriserVersionManuelle(d, doc.name))) {
      return envoyer(connection, { type: 'erreur', message: 'Une version par minute au plus pour ce document.' });
    }
    const v = await suivi.executerSeul(() =>
      versionDocument(doc.name, doc, suivi, 'manuelle', connection.context.email, libelle || undefined, chiffre),
    );
    envoyer(connection, { type: 'versionCreee', numero: v.numero, versionId: v.versionId });
  }

  const extension: Extension<ContexteConnexion> = {
    extensionName: 'b-synctext',

    // HTTP : seul GET /sante répond sans l'en-tête secret ; le reste est refusé.
    async onRequest({ request, response }) {
      if (request.method === 'GET' && chemin(request) === '/sante') {
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('ok');
      } else {
        const statut = origineValide(request, o.secretOrigine) ? 404 : 403;
        response.writeHead(statut, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(statut === 403 ? 'interdit' : 'introuvable');
      }
      // Rejet sans erreur : Hocuspocus n'écrit pas sa réponse par défaut.
      throw null;
    },

    // WebSocket : chemin /collab et en-tête secret obligatoires, sinon 403 avant toute connexion.
    async onUpgrade({ request, socket }) {
      const p = chemin(request);
      if ((p === '/collab' || p.startsWith('/collab/')) && origineValide(request, o.secretOrigine)) return;
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      throw null;
    },

    // Jeton de session + appartenance au document ; bloqué → lecture seule.
    async onAuthenticate({ token, documentName, connectionConfig }) {
      if (!DOC_ID_VALIDE.test(documentName)) throw new Error('document invalide');
      const contenu = verifierJeton<{ exp: number; email?: unknown; nom?: unknown }>(token, await o.secretSession(), d.maintenant());
      if (!contenu || typeof contenu.email !== 'string') throw new Error('jeton invalide');
      const email = contenu.email;
      const membre = await d.ddb.send(
        new GetCommand({ TableName: d.tables.membres, Key: { docId: documentName, email }, ConsistentRead: true }),
      );
      if (!membre.Item) throw new Error('non membre du document');
      const bloqueJusqua = Math.max((await lireBlocage(d, email)) ?? 0, bloques.get(email) ?? 0);
      const contexte: ContexteConnexion = { email, nom: typeof contenu.nom === 'string' ? contenu.nom : email };
      if (bloqueJusqua > d.maintenant()) {
        connectionConfig.readOnly = true;
        contexte.bloqueJusqua = bloqueJusqua;
      }
      return contexte;
    },

    async connected({ connection }) {
      const fin = connection.context?.bloqueJusqua;
      if (fin && fin > d.maintenant()) envoyer(connection, { type: 'refus', raison: 'bloque', bloqueJusqua: fin });
    },

    // Reconstruction depuis S3 + journal (lecture forte).
    async onLoadDocument({ document, documentName }) {
      const r = await reconstruire(d, documentName, document);
      const suivi = new SuiviDocument(d.maintenant(), r.dernierSeq);
      suivis.set(documentName, suivi);
      document.on('update', () => suivi.invaliderLongueur());
    },

    // Contrôle AVANT application : appelé par Hocuspocus pour chaque message Sync,
    // avant readSyncStep2 / readUpdate. type 1 = SyncStep2, 2 = Update ; payload = mise à jour Yjs.
    async beforeSync({ type, payload, connection, document, documentName }) {
      if (type !== 1 && type !== 2) return;
      const ctx = connection.context;
      if (connection.readOnly) {
        if (finBlocage(ctx) > d.maintenant()) return; // Hocuspocus n'applique rien en lecture seule
        connection.readOnly = false; // blocage terminé
        ctx.bloqueJusqua = undefined;
        bloques.delete(ctx.email);
      }
      const suivi = suivis.get(documentName);
      if (!suivi) throw new Error(`document non chargé : ${documentName}`);

      const r = await controlerMiseAJour(d, {
        docId: documentName,
        ydoc: document,
        maj: payload.slice(),
        email: ctx.email,
        bloqueJusqua: finBlocage(ctx) || undefined,
        suivi,
      });
      if (r.decision === 'ignoree') return;
      if (r.decision === 'acceptee') {
        enAttente.set(connection, [...(enAttente.get(connection) ?? []), r.seq]);
        if (r.restant !== undefined) envoyer(connection, { type: 'credit', restant: r.restant, rechargeA: r.rechargeA });
        return;
      }
      // Refus : message d'abord, puis erreur pour que la mise à jour ne soit pas appliquée.
      const { decision: _d, ...detail } = r;
      envoyer(connection, { type: 'refus', ...detail });
      try {
        const compte = await enregistrerRefus(d, ctx.email, r.raison);
        if (compte.bloqueJusqua) bloquer(ctx.email, compte.bloqueJusqua);
      } catch (e) {
        console.error('compteur de refus indisponible', e);
      }
      throw new ErreurRefus(r.raison);
    },

    async afterHandleMessage({ connection, documentName }) {
      const seqs = enAttente.get(connection);
      if (!seqs) return;
      enAttente.delete(connection);
      const suivi = suivis.get(documentName);
      for (const s of seqs) suivi?.finEcriture(s);
    },

    // Messages sans état du client. Non attendu par Hocuspocus : toute erreur est capturée ici.
    async onStateless({ connection, document, payload }) {
      const c = connection as Connection<ContexteConnexion>;
      try {
        const message = JSON.parse(payload) as { type?: unknown; nom?: unknown; niveau?: unknown; versionId?: unknown };
        const suivi = suivis.get(document.name);
        if (!suivi) return;
        if (message.type === 'creerVersion') await creerVersionManuelle(c, document, suivi, message.nom, message.niveau);
        else if (message.type === 'restaurer' && typeof message.versionId === 'string') {
          await restaurer(c, document, suivi, message.versionId);
        } else envoyer(c, { type: 'erreur', message: 'Message inconnu.' });
      } catch (e) {
        console.error('message sans état en échec', e);
        try {
          envoyer(c, { type: 'erreur', message: 'Action impossible pour le moment.' });
        } catch {
          // connexion déjà fermée
        }
      }
    },

    // Dernier rédacteur parti : compactage, version auto si changement, présence à 0.
    async beforeUnloadDocument({ documentName, document }) {
      const suivi = suivis.get(documentName);
      if (!suivi) return;
      try {
        await suivi.executerSeul(async () => {
          if (suivi.modifieDepuisCompactage) await compacterDocument(documentName, document, suivi);
          if (suivi.modifieDepuisVersion) {
            const auteurs = [...suivi.auteursDepuisVersion];
            await versionDocument(documentName, document, suivi, 'auto', auteurs.at(-1) ?? 'serveur');
          }
        });
      } catch (e) {
        console.error('déchargement : compactage ou version en échec (le journal reste complet)', e);
      }
      try {
        await majPresence(d, documentName, 0, suivi.modifieDepuisPresence);
        suivi.modifieDepuisPresence = false;
      } catch (e) {
        console.error('présence non mise à jour', e);
      }
    },

    async afterUnloadDocument({ documentName }) {
      suivis.delete(documentName);
    },

    async onDestroy() {
      clearInterval(minuterie);
    },
  };

  serveur = new Server<ContexteConnexion>({
    name: 'b-synctext-edition',
    port: o.port,
    quiet: true,
    stopOnSignals: o.arretSurSignaux ?? true,
    extensions: [extension],
    // Borne la taille d'un message WebSocket (un collage reste bien en dessous).
    websocketOptions: { maxPayload: 4 * 1024 * 1024 },
  });

  /** Tâches périodiques par document ouvert : présence, compactage (30 s), version auto (10 min). */
  let ticEnCours = false;
  async function tic(): Promise<void> {
    if (ticEnCours) return;
    ticEnCours = true;
    try {
      const taches = [...serveur.hocuspocus.documents.entries()].map(async ([docId, doc]) => {
        const suivi = suivis.get(docId);
        if (!suivi || doc.isLoading) return;
        const m = d.maintenant();
        const modifie = suivi.modifieDepuisPresence;
        suivi.modifieDepuisPresence = false;
        try {
          await majPresence(d, docId, doc.getConnectionsCount(), modifie);
        } catch (e) {
          suivi.modifieDepuisPresence ||= modifie;
          throw e;
        }
        if (suivi.modifieDepuisCompactage && m - suivi.derniereCompactage >= delaiCompactage) {
          await suivi.executerSeul(() => compacterDocument(docId, doc, suivi));
        }
        if (suivi.modifieDepuisVersion && m - suivi.derniereModification >= delaiVersionAuto) {
          const auteurs = [...suivi.auteursDepuisVersion];
          await suivi.executerSeul(() => versionDocument(docId, doc, suivi, 'auto', auteurs.at(-1) ?? 'serveur'));
        }
      });
      for (const r of await Promise.allSettled(taches)) {
        if (r.status === 'rejected') console.error('tâche périodique en échec', r.reason);
      }
    } finally {
      ticEnCours = false;
    }
  }
  const minuterie = setInterval(() => void tic(), intervalle);
  minuterie.unref();

  return { serveur, suivis, tic };
}

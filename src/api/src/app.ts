// Gestionnaires des routes. Reçoit une requête neutre, renvoie une réponse neutre.
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CREDIT_JOURNALIER,
  estEmailValide,
  estFormatVersion,
  estModeTelechargement,
  FORMAT_VERSION_DEFAUT,
  jourWat,
  normaliserEmail,
  nouvelId,
  prochaineRecharge,
  signerJeton,
  verifierJeton,
  type FormatVersion,
  type ModeTelechargement,
} from '@b-synctext/commun';
import { planifierRole, exigerMembre, exigerProprietaire, type NouveauRole } from './regles.js';
import { trouverRoute, type Params, type Route } from './routeur.js';
import { ErreurHttp, type Contexte, type Document, type Lien, type Redacteur } from './types.js';

export interface Requete {
  methode: string;
  chemin: string;
  entetes: Record<string, string | undefined>;
  corps?: string;
}

export interface Reponse {
  statut: number;
  corps?: unknown;
}

interface Appel {
  ctx: Contexte;
  params: Params;
  entetes: Requete['entetes'];
  corps: Record<string, unknown>;
}

type Gestionnaire = (a: Appel) => Promise<Reponse>;

const MAX_N = 10_000;
const ECHECS_ADMIN_PAR_MINUTE = 10;

// ---------- utilitaires ----------

function valider(condition: boolean, message: string): void {
  if (!condition) throw new ErreurHttp(400, 'requete_invalide', message);
}

function titreValide(v: unknown): string {
  valider(typeof v === 'string', 'Le titre est obligatoire.');
  const t = (v as string).trim();
  valider(t.length >= 1 && t.length <= 120, 'Le titre doit faire de 1 à 120 caractères.');
  return t;
}

function emailValide(v: unknown): string {
  valider(typeof v === 'string' && estEmailValide(normaliserEmail(v)), "L'e-mail n'est pas valide.");
  return normaliserEmail(v as string);
}

/** Identité tirée du jeton de session ; 401 sinon. */
async function identifier(a: Appel): Promise<{ email: string; nom: string }> {
  const brut = a.entetes['authorization'] ?? '';
  const m = /^Bearer (.+)$/.exec(brut);
  if (!m) throw new ErreurHttp(401, 'non_authentifie', 'Jeton de session manquant.');
  const contenu = verifierJeton(m[1], await a.ctx.secrets.secretSession(), a.ctx.maintenant());
  if (!contenu || typeof contenu.email !== 'string') {
    throw new ErreurHttp(401, 'non_authentifie', 'Jeton de session invalide ou expiré.');
  }
  return { email: contenu.email, nom: typeof contenu.nom === 'string' ? contenu.nom : contenu.email };
}

/** Pour les routes d'écriture : un rédacteur bloqué reçoit 423. */
async function exigerNonBloque(a: Appel, email: string): Promise<void> {
  const r = await a.ctx.donnees.getRedacteur(email);
  if (r?.bloqueJusqua && r.bloqueJusqua > a.ctx.maintenant()) {
    throw new ErreurHttp(423, 'bloque', 'Écriture suspendue : votre accès est temporairement bloqué.');
  }
}

async function objetRedacteur(a: Appel, r: Redacteur) {
  const maintenant = a.ctx.maintenant();
  const restant = await a.ctx.donnees.getCredit(r.email, jourWat(maintenant));
  return {
    email: r.email,
    nom: r.nom,
    credit: { restant: restant ?? CREDIT_JOURNALIER, rechargeA: prochaineRecharge(maintenant) },
    bloqueJusqua: r.bloqueJusqua && r.bloqueJusqua > maintenant ? r.bloqueJusqua : null,
  };
}

async function documentOuErreur(a: Appel, docId: string): Promise<Document> {
  const doc = await a.ctx.donnees.getDocument(docId);
  if (!doc) throw new ErreurHttp(404, 'introuvable', 'Document introuvable.');
  return doc;
}

const lienInvitation = (jeton: string) => `/invitation/${jeton}`;

// ---------- routes ----------

const session: Gestionnaire = async (a) => {
  valider(typeof a.corps.nom === 'string', 'Le nom est obligatoire.');
  const nom = (a.corps.nom as string).trim();
  valider(nom.length >= 1 && nom.length <= 80, 'Le nom doit faire de 1 à 80 caractères.');
  const email = emailValide(a.corps.email);
  const r = await a.ctx.donnees.assurerRedacteur(email, nom, a.ctx.maintenant());
  const jeton = signerJeton({ email, nom: r.nom }, await a.ctx.secrets.secretSession(), a.ctx.maintenant());
  return { statut: 200, corps: { jeton, redacteur: await objetRedacteur(a, r) } };
};

const moi: Gestionnaire = async (a) => {
  const id = await identifier(a);
  const r =
    (await a.ctx.donnees.getRedacteur(id.email)) ??
    (await a.ctx.donnees.assurerRedacteur(id.email, id.nom, a.ctx.maintenant()));
  return { statut: 200, corps: await objetRedacteur(a, r) };
};

const listerDocuments: Gestionnaire = async (a) => {
  const id = await identifier(a);
  const d = a.ctx.donnees;
  const mes = await d.listerMembresDe(id.email);
  const docs = await d.getDocuments(mes.map((m) => m.docId));
  const parId = new Map(docs.map((x) => [x.docId, x]));
  const liste = await Promise.all(
    mes.map(async (m) => {
      const doc = parId.get(m.docId);
      if (!doc) return null;
      const principal = (await d.listerMembres(m.docId)).find((x) => x.role === 'principal');
      return {
        docId: doc.docId,
        titre: doc.titre,
        role: m.role,
        principal: principal ? { email: principal.email, nom: principal.nom } : null,
        modifieLe: doc.modifieLe,
        connectes: doc.connectes ?? 0,
      };
    }),
  );
  const resultat = liste.filter((x) => x !== null).sort((x, y) => y.modifieLe - x.modifieLe);
  return { statut: 200, corps: resultat };
};

const creerDocument: Gestionnaire = async (a) => {
  const id = await identifier(a);
  await exigerNonBloque(a, id.email);
  const titre = titreValide(a.corps.titre);
  // Format de numérotation des versions (D-011) : choisi ici, définitif.
  const formatBrut = a.corps.formatVersion ?? FORMAT_VERSION_DEFAUT;
  valider(estFormatVersion(formatBrut), 'Le format de version doit être v.x, v.x.x ou v.x.x.x.');
  const formatVersion = formatBrut as FormatVersion;
  const maintenant = a.ctx.maintenant();
  const docId = nouvelId();
  const jeton = `${docId}.${nouvelId()}`;
  const doc: Document = {
    docId,
    titre,
    creeLe: maintenant,
    creePar: id.email,
    modifieLe: maintenant,
    jetonInvitation: jeton,
    formatVersion,
    modeTelechargement: 'version',
    niv1: 0,
    niv2: 0,
    niv3: 0,
  };
  await a.ctx.donnees.creerDocument(doc, {
    docId,
    email: id.email,
    nom: id.nom,
    role: 'principal',
    nommeLe: maintenant,
  });
  return {
    statut: 201,
    corps: { docId, titre, role: 'principal', formatVersion, lienInvitation: lienInvitation(jeton) },
  };
};

const lireDocument: Gestionnaire = async (a) => {
  const id = await identifier(a);
  const { docId } = a.params as { docId: string };
  const doc = await documentOuErreur(a, docId);
  const moiMembre = exigerMembre(await a.ctx.donnees.getMembre(docId, id.email));
  const membres = await a.ctx.donnees.listerMembres(docId);
  const corps: Record<string, unknown> = {
    docId,
    titre: doc.titre,
    role: moiMembre.role,
    formatVersion: doc.formatVersion ?? FORMAT_VERSION_DEFAUT,
    modeTelechargement: doc.modeTelechargement ?? 'version',
    derniereVersion: doc.derniereVersionId ? { versionId: doc.derniereVersionId, numero: doc.derniereVersionNumero ?? null } : null,
    membres: membres.map((m) => ({ email: m.email, nom: m.nom, role: m.role })),
  };
  if (moiMembre.role !== 'membre') corps.lienInvitation = lienInvitation(doc.jetonInvitation);
  return { statut: 200, corps };
};

const ajouterMembre: Gestionnaire = async (a) => {
  const id = await identifier(a);
  await exigerNonBloque(a, id.email);
  const { docId } = a.params as { docId: string };
  await documentOuErreur(a, docId);
  exigerProprietaire(await a.ctx.donnees.getMembre(docId, id.email));
  const email = emailValide(a.corps.email);
  // Le nom est inconnu tant que l'invité n'est pas venu : on garde son e-mail.
  const fiche = await a.ctx.donnees.getRedacteur(email);
  await a.ctx.donnees.ajouterMembre({
    docId,
    email,
    nom: fiche?.nom ?? email,
    role: 'membre',
    nommeLe: a.ctx.maintenant(),
  });
  return { statut: 201, corps: { email } };
};

const changerRole: Gestionnaire = async (a) => {
  const id = await identifier(a);
  await exigerNonBloque(a, id.email);
  const { docId, email } = a.params as { docId: string; email: string };
  await documentOuErreur(a, docId);
  valider(a.corps.role === 'proprietaire' || a.corps.role === 'membre', 'Rôle attendu : proprietaire ou membre.');
  const acteur = exigerMembre(await a.ctx.donnees.getMembre(docId, id.email));
  const membres = await a.ctx.donnees.listerMembres(docId);
  const changements = planifierRole(membres, acteur, normaliserEmail(email), a.corps.role as NouveauRole);
  if (changements.length > 0) await a.ctx.donnees.changerRoles(docId, changements);
  return { statut: 200, corps: { changements } };
};

// Modifier : le titre ou le mode de téléchargement (tout rédacteur membre, depuis l'éditeur, D-012).
const modifierDocument: Gestionnaire = async (a) => {
  const id = await identifier(a);
  await exigerNonBloque(a, id.email);
  const { docId } = a.params as { docId: string };
  await documentOuErreur(a, docId);
  exigerMembre(await a.ctx.donnees.getMembre(docId, id.email));
  const champs: { titre?: string; modeTelechargement?: ModeTelechargement } = {};
  if (a.corps.titre !== undefined) champs.titre = titreValide(a.corps.titre);
  if (a.corps.modeTelechargement !== undefined) {
    const mode = a.corps.modeTelechargement;
    valider(estModeTelechargement(mode), "Le mode de téléchargement doit être 'version' ou 'direct'.");
    champs.modeTelechargement = mode as ModeTelechargement;
  }
  valider(Object.keys(champs).length > 0, 'Rien à modifier.');
  await a.ctx.donnees.modifierDocument(docId, champs);
  return { statut: 200, corps: { docId, ...champs } };
};

const regenererInvitation: Gestionnaire = async (a) => {
  const id = await identifier(a);
  await exigerNonBloque(a, id.email);
  const { docId } = a.params as { docId: string };
  await documentOuErreur(a, docId);
  exigerProprietaire(await a.ctx.donnees.getMembre(docId, id.email));
  const jeton = `${docId}.${nouvelId()}`;
  await a.ctx.donnees.definirJetonInvitation(docId, jeton);
  return { statut: 200, corps: { lienInvitation: lienInvitation(jeton) } };
};

const accepterInvitation: Gestionnaire = async (a) => {
  const id = await identifier(a);
  await exigerNonBloque(a, id.email);
  const jeton = (a.params as { jeton: string }).jeton;
  // Le jeton a la forme <docId>.<aléa> : le docId permet de retrouver le document sans index.
  const point = jeton.indexOf('.');
  if (point < 1) throw new ErreurHttp(404, 'introuvable', 'Invitation introuvable.');
  const doc = await a.ctx.donnees.getDocument(jeton.slice(0, point));
  if (!doc) throw new ErreurHttp(404, 'introuvable', 'Invitation introuvable.');
  if (doc.jetonInvitation !== jeton) {
    throw new ErreurHttp(410, 'invitation_expiree', 'Cette invitation a expiré.');
  }
  await a.ctx.donnees.ajouterMembre({
    docId: doc.docId,
    email: id.email,
    nom: id.nom,
    role: 'membre',
    nommeLe: a.ctx.maintenant(),
  });
  return { statut: 200, corps: { docId: doc.docId } };
};

const listerVersions: Gestionnaire = async (a) => {
  const id = await identifier(a);
  const { docId } = a.params as { docId: string };
  await documentOuErreur(a, docId);
  exigerMembre(await a.ctx.donnees.getMembre(docId, id.email));
  const versions = await a.ctx.donnees.listerVersions(docId);
  return {
    statut: 200,
    corps: versions.map((v) => ({
      versionId: v.versionId,
      numero: v.numero,
      horodatage: v.creeLe,
      nom: v.nom ?? null,
      type: v.type,
      auteurs: [v.auteur],
    })),
  };
};

const lireVersion: Gestionnaire = async (a) => {
  const id = await identifier(a);
  const { docId, versionId } = a.params as { docId: string; versionId: string };
  await documentOuErreur(a, docId);
  exigerMembre(await a.ctx.donnees.getMembre(docId, id.email));
  const v = await a.ctx.donnees.getVersion(docId, versionId);
  if (!v) throw new ErreurHttp(404, 'introuvable', 'Version introuvable.');
  const etat = await a.ctx.donnees.lireEtatVersion(v.cleS3);
  if (!etat) throw new ErreurHttp(404, 'introuvable', 'Contenu de la version introuvable.');
  return { statut: 200, corps: { versionId, numero: v.numero, contenu: a.ctx.versBlocs(etat) } };
};

const creerLien: Gestionnaire = async (a) => {
  const id = await identifier(a);
  await exigerNonBloque(a, id.email);
  const { docId } = a.params as { docId: string };
  const doc = await documentOuErreur(a, docId);
  const membre = exigerMembre(await a.ctx.donnees.getMembre(docId, id.email));
  const n = a.corps.n;
  valider(typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_N, `n doit être un entier de 1 à ${MAX_N}.`);
  const lien: Lien = {
    lienId: nouvelId(),
    docId,
    titre: doc.titre,
    creePar: membre.email,
    creeParNom: membre.nom,
    n: n as number,
    disponibles: n as number,
    comptes: 0,
    numerotation: 0,
    etat: 'actif',
    notifie: false,
    creeLe: a.ctx.maintenant(),
  };
  await a.ctx.donnees.creerLien(lien);
  return { statut: 201, corps: { lienId: lien.lienId, url: `/l/${lien.lienId}`, n: lien.n } };
};

const listerLiens: Gestionnaire = async (a) => {
  const id = await identifier(a);
  const { docId } = a.params as { docId: string };
  await documentOuErreur(a, docId);
  exigerMembre(await a.ctx.donnees.getMembre(docId, id.email));
  const liens = await a.ctx.donnees.listerLiens(docId);
  return {
    statut: 200,
    corps: liens.map((l) => ({
      lienId: l.lienId,
      url: `/l/${l.lienId}`,
      n: l.n,
      restants: l.disponibles,
      etat: l.etat,
      // e-mail « lien épuisé » : 'envoye', 'echec' (adresse non vérifiée en bac à sable SES…) ou null
      email: l.emailEnvoye === true ? 'envoye' : l.emailErreur ? 'echec' : null,
      emailErreur: l.emailErreur ?? null,
      creeLe: l.creeLe,
      creePar: l.creeParNom,
    })),
  };
};

/** Comparaison à temps constant (empreintes de même longueur). */
function egalConstant(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

const tableauDeBord: Gestionnaire = async (a) => {
  const d = a.ctx.donnees;
  const maintenant = a.ctx.maintenant();
  const cle = `admin#${Math.floor(maintenant / 60_000)}`;
  if ((await d.lireCompteur(cle)) >= ECHECS_ADMIN_PAR_MINUTE) {
    throw new ErreurHttp(429, 'trop_de_requetes', "Trop d'essais : réessayez dans une minute.");
  }
  const fourni = a.entetes['x-code-admin'];
  const attendu = await a.ctx.secrets.codeAdmin();
  if (typeof fourni !== 'string' || !egalConstant(fourni, attendu)) {
    await d.incrementerCompteur(cle, Math.floor(maintenant / 1000) + 600);
    throw new ErreurHttp(403, 'interdit', 'Code administrateur incorrect.');
  }
  // Les Scan sont acceptables : quelques centaines de documents, de liens et de rédacteurs
  // au plus, et la page n'est rafraîchie que toutes les quelques secondes par un seul usage.
  const [ouverts, liens, bloques] = await Promise.all([
    d.scanDocumentsOuverts(maintenant - 15_000),
    d.scanLiensActifs(),
    d.scanRedacteursBloques(maintenant),
  ]);
  return {
    statut: 200,
    corps: {
      documentsOuverts: await Promise.all(ouverts.map(async (x) => {
        const principal = (await d.listerMembres(x.docId)).find((m) => m.role === 'principal');
        return { docId: x.docId, titre: x.titre, principal: principal ? { email: principal.email, nom: principal.nom } : null, connectes: x.connectes ?? 0 };
      })),
      liensActifs: liens.map((l) => ({
        lienId: l.lienId,
        docId: l.docId,
        titre: l.titre,
        creePar: l.creeParNom,
        n: l.n,
        restants: l.disponibles,
      })),
      bloques: bloques.map((r) => ({
        email: r.email,
        nom: r.nom,
        motif: r.motifBlocage ?? null,
        bloqueJusqua: r.bloqueJusqua,
      })),
    },
  };
};

export const routes: Route<Gestionnaire>[] = [
  { methode: 'POST', motif: '/session', gestionnaire: session },
  { methode: 'GET', motif: '/moi', gestionnaire: moi },
  { methode: 'GET', motif: '/documents', gestionnaire: listerDocuments },
  { methode: 'POST', motif: '/documents', gestionnaire: creerDocument },
  { methode: 'GET', motif: '/documents/{docId}', gestionnaire: lireDocument },
  { methode: 'POST', motif: '/documents/{docId}/membres', gestionnaire: ajouterMembre },
  { methode: 'PATCH', motif: '/documents/{docId}/membres/{email}', gestionnaire: changerRole },
  { methode: 'PATCH', motif: '/documents/{docId}', gestionnaire: modifierDocument },
  { methode: 'POST', motif: '/documents/{docId}/invitation', gestionnaire: regenererInvitation },
  { methode: 'POST', motif: '/invitations/{jeton}', gestionnaire: accepterInvitation },
  { methode: 'GET', motif: '/documents/{docId}/versions', gestionnaire: listerVersions },
  { methode: 'GET', motif: '/documents/{docId}/versions/{versionId}', gestionnaire: lireVersion },
  { methode: 'POST', motif: '/documents/{docId}/liens', gestionnaire: creerLien },
  { methode: 'GET', motif: '/documents/{docId}/liens', gestionnaire: listerLiens },
  { methode: 'GET', motif: '/admin/tableau-de-bord', gestionnaire: tableauDeBord },
];

const erreur = (statut: number, code: string, message: string): Reponse => ({
  statut,
  corps: { erreur: { code, message } },
});

/** Point d'entrée neutre : route, valide le corps, convertit toute erreur. Jamais de 500 détaillé. */
export async function traiter(ctx: Contexte, req: Requete): Promise<Reponse> {
  try {
    const chemin = req.chemin.replace(/^\/api(?=\/|$)/, '') || '/';
    const trouve = trouverRoute(routes, req.methode.toUpperCase(), chemin);
    if (!trouve) return erreur(404, 'introuvable', 'Route inconnue.');
    if ('chemin' in trouve) return erreur(405, 'methode_interdite', 'Méthode non permise.');
    let corps: Record<string, unknown> = {};
    if (req.corps && req.corps.trim() !== '') {
      let brut: unknown;
      try {
        brut = JSON.parse(req.corps);
      } catch {
        return erreur(400, 'requete_invalide', 'Corps JSON invalide.');
      }
      if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) {
        return erreur(400, 'requete_invalide', 'Le corps doit être un objet JSON.');
      }
      corps = brut as Record<string, unknown>;
    }
    return await trouve.route.gestionnaire({ ctx, params: trouve.params, entetes: req.entetes, corps });
  } catch (e) {
    if (e instanceof ErreurHttp) return erreur(e.statut, e.code, e.message);
    console.error('erreur interne', e instanceof Error ? e.name : 'inconnue');
    return erreur(500, 'erreur_interne', 'Une erreur est survenue. Réessayez.');
  }
}

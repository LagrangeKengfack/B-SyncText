// Logique des trois routes publiques d'un lien (C-1, C-3, C-5, C-6), sans dépendance directe à AWS.
import { DUREE_RESERVATION_MS } from '@b-synctext/commun';
import type { Depot, Lien } from './depot.js';
import {
  CacheEpuises, type ReponseHttp, epuise, erreur, estErreurDebit, estIdValide, estRefusCondition, introuvable, json,
  nomFichier, patientez, pret,
} from './regles.js';

export interface Ports {
  depot: Depot;
  cache: CacheEpuises;
  maintenant: () => number;
  nouvelId: () => string;
  /** PDF de l'exemplaire k (reconstruction du document, PDF de base, tampon). */
  produirePdf: (lien: Lien, k: number, maintenant: number) => Promise<Uint8Array>;
  /** E-mail « lien épuisé » au créateur. */
  envoyerCourriel: (lien: Lien, epuiseLe: number) => Promise<void>;
  journal?: (message: string, erreur?: unknown) => void;
}

/** Nombre de réservations expirées remises en stock par demande, au plus. */
const LIMITE_REMISE = 5;

function journaliser(p: Ports, message: string, e?: unknown): void {
  (p.journal ?? ((m, err) => console.error(m, err ?? '')))(message, e);
}

/** Lien épuisé : état définitif, puis un seul e-mail (drapeau `notifie`). Ne lève jamais. */
export async function cloturer(p: Ports, lien: Lien, maintenant: number): Promise<void> {
  p.cache.ajouter(lien.lienId, lien.titre, lien.n);
  try {
    await p.depot.marquerEpuise(lien.lienId, maintenant);
    if (await p.depot.marquerNotifie(lien.lienId)) {
      try {
        await p.envoyerCourriel(lien, maintenant);
      } catch (e) {
        journaliser(p, `envoi de l'e-mail impossible pour le lien ${lien.lienId}`, e);
      }
    }
  } catch (e) {
    journaliser(p, `clôture du lien ${lien.lienId} incomplète`, e);
  }
}

/** GET /api/liens/{lienId} */
export async function traiterLien(p: Ports, lienId: string): Promise<ReponseHttp> {
  if (!estIdValide(lienId)) return introuvable();
  const vu = p.cache.lire(lienId);
  if (vu) return json(200, { titre: vu.titre, n: vu.n, restants: 0, etat: 'epuise' });
  try {
    const lien = await p.depot.lireLien(lienId);
    if (!lien) return introuvable();
    if (lien.etat === 'epuise') p.cache.ajouter(lienId, lien.titre, lien.n);
    // Restants = exemplaires pas encore téléchargés (réservés compris).
    return json(200, { titre: lien.titre, n: lien.n, restants: Math.max(0, lien.n - lien.comptes), etat: lien.etat });
  } catch (e) {
    if (estErreurDebit(e)) return erreur(429, 'sature', 'Service momentanément saturé, réessayez.');
    throw e;
  }
}

/** Une tentative de réservation ; null si plus rien de libre. */
async function tenterReservation(p: Ports, lienId: string): Promise<ReponseHttp | null> {
  const apres = await p.depot.reserver(lienId);
  if (!apres) return null;
  const ticket = p.nouvelId();
  const expireA = p.maintenant() + DUREE_RESERVATION_MS;
  try {
    await p.depot.creerReservation(ticket, lienId, expireA);
  } catch (e) {
    // Condition refusée : une tentative précédente du SDK a déjà écrit ce ticket.
    if (estRefusCondition(e)) return json(200, pret(ticket, expireA, apres.disponibles, apres.n));
    // Refus de débit certain : l'écriture n'a pas eu lieu, on rend l'exemplaire.
    // Autre erreur (ambiguë) : on ne rend rien, au pire un exemplaire perdu, jamais un de trop.
    if (estErreurDebit(e)) {
      try { await p.depot.annulerReservation(lienId); } catch (e2) { journaliser(p, `exemplaire perdu sur ${lienId}`, e2); }
    } else {
      journaliser(p, `exemplaire perdu sur ${lienId}`, e);
    }
    throw e;
  }
  return json(200, pret(ticket, expireA, apres.disponibles, apres.n));
}

/** POST /api/liens/{lienId}/demandes */
export async function traiterDemande(p: Ports, lienId: string): Promise<ReponseHttp> {
  if (!estIdValide(lienId)) return introuvable();
  const vu = p.cache.lire(lienId);
  if (vu) return json(200, epuise(vu.n));
  let lien: Lien | undefined;
  try {
    // Lecture préalable (cohérence éventuelle) : évite une écriture vouée à l'échec.
    lien = await p.depot.lireLien(lienId);
    if (!lien) return introuvable();
    if (lien.etat === 'epuise') {
      p.cache.ajouter(lienId, lien.titre, lien.n);
      return json(200, epuise(lien.n));
    }
    if (lien.disponibles > 0) {
      const r = await tenterReservation(p, lienId);
      if (r) return r;
    }
    // Plus rien de libre : les visiteurs qui patientent remettent en stock les réservations expirées.
    const t = p.maintenant();
    const tickets = await p.depot.chercherExpirees(lienId, t, LIMITE_REMISE);
    const rendus = (await Promise.all(tickets.map((tk) => p.depot.remettreEnStock(tk, lienId, t)))).filter(Boolean).length;
    if (rendus > 0) {
      const r = await tenterReservation(p, lienId);
      if (r) return r;
    }
    // Invariant disponibles + réservés + comptés = N : comptés = N veut dire ni libre ni réservé.
    if (lien.comptes >= lien.n) {
      await cloturer(p, lien, t);
      return json(200, epuise(lien.n));
    }
    return json(200, patientez(lien.n));
  } catch (e) {
    if (estErreurDebit(e)) return json(200, patientez(lien?.n ?? 0));
    throw e;
  }
}

/** GET /api/liens/{lienId}/fichier?ticket=… */
export async function traiterFichier(p: Ports, lienId: string, ticket: string | undefined): Promise<ReponseHttp> {
  if (!estIdValide(lienId)) return introuvable();
  if (!ticket) return erreur(400, 'requete_invalide', 'Paramètre ticket manquant.');
  if (!estIdValide(ticket) || p.cache.lire(lienId)) {
    return erreur(410, 'ticket_invalide', 'Adresse de fichier déjà utilisée ou expirée.');
  }
  const t = p.maintenant();
  let compte: boolean;
  try {
    compte = await p.depot.compter(ticket, lienId, t);
  } catch (e) {
    // Transaction refusée en bloc : le ticket reste valable, le visiteur peut réessayer.
    if (estErreurDebit(e)) return erreur(429, 'sature', 'Service momentanément saturé, réessayez.');
    throw e;
  }
  if (!compte) return erreur(410, 'ticket_invalide', 'Adresse de fichier déjà utilisée ou expirée.');

  const lien = await p.depot.numeroter(lienId);
  const k = lien.numerotation;
  const fin = k >= lien.n ? cloturer(p, lien, t) : Promise.resolve();
  const [pdf] = await Promise.all([p.produirePdf(lien, k, t), fin]);
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${nomFichier(lien.titre, k)}"`,
      'cache-control': 'no-store',
    },
    body: Buffer.from(pdf).toString('base64'),
    isBase64Encoded: true,
  };
}

// Dépôt en mémoire, aux mêmes règles atomiques que DynamoDB (une opération = une étape synchrone).
import type { Depot, Lien } from './depot.js';

export interface Reservation { ticket: string; lienId: string; statut: 'reserve' | 'compte' | 'expire'; expireA: number }

export function depotMemoire(liens: Lien[]) {
  const tableLiens = new Map(liens.map((l) => [l.lienId, { ...l }]));
  const reservations = new Map<string, Reservation>();
  const tick = () => new Promise((r) => setImmediate(r)); // laisse les autres demandes s'intercaler
  const depot: Depot = {
    async lireLien(id) { await tick(); const l = tableLiens.get(id); return l && { ...l }; },
    async reserver(id) {
      await tick();
      const l = tableLiens.get(id);
      if (!l || l.disponibles <= 0 || l.etat !== 'actif') return null;
      l.disponibles--;
      return { ...l };
    },
    async creerReservation(ticket, lienId, expireA) { await tick(); reservations.set(ticket, { ticket, lienId, statut: 'reserve', expireA }); },
    async annulerReservation(id) { await tick(); tableLiens.get(id)!.disponibles++; },
    async chercherExpirees(id, m, limite) {
      await tick();
      return [...reservations.values()].filter((r) => r.lienId === id && r.statut === 'reserve' && r.expireA <= m).slice(0, limite).map((r) => r.ticket);
    },
    async remettreEnStock(ticket, id, m) {
      await tick();
      const r = reservations.get(ticket);
      if (!r || r.statut !== 'reserve' || r.expireA > m || r.lienId !== id) return false;
      r.statut = 'expire';
      tableLiens.get(id)!.disponibles++;
      return true;
    },
    async compter(ticket, id, m) {
      await tick();
      const r = reservations.get(ticket);
      const l = tableLiens.get(id);
      if (!r || !l || r.statut !== 'reserve' || r.expireA <= m || r.lienId !== id) return false;
      r.statut = 'compte';
      return true;
    },
    async numeroter(id) { await tick(); const l = tableLiens.get(id)!; l.numerotation++; l.comptes++; return { ...l }; },
    async marquerEpuise(id, m) {
      await tick();
      const l = tableLiens.get(id)!;
      if (l.etat === 'actif' && l.comptes >= l.n) { l.etat = 'epuise'; l.epuiseLe = m; }
    },
    async marquerEmail(id, envoye, erreur) {
      const l = tableLiens.get(id)!;
      l.emailEnvoye = envoye;
      if (erreur) l.emailErreur = erreur; else delete l.emailErreur;
    },
    async marquerNotifie(id) {
      await tick();
      const l = tableLiens.get(id)!;
      if (l.notifie) return false;
      l.notifie = true;
      return true;
    },
  };
  return { depot, tableLiens, reservations };
}

export function lienDeTest(n: number, lienId = 'L'.repeat(22)): Lien {
  return { lienId, docId: 'D'.repeat(22), titre: 'Mon document', creePar: 'auteur@exemple.fr', n, disponibles: n, comptes: 0, numerotation: 0, etat: 'actif', notifie: false, creeLe: 0 };
}

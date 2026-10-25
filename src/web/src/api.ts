// Client de l'API REST (même origine, préfixe /api). Types selon docs/conception/06-donnees-et-api.md.

export const CLE_JETON = 'bsynctext.jeton'

export interface Credit { restant: number; rechargeA: number }
export interface Redacteur { email: string; nom: string; credit: Credit; bloqueJusqua?: number }
export type Role = 'principal' | 'proprietaire' | 'membre'
export interface DocumentResume {
  docId: string
  titre: string
  role: Role
  principal: string | { nom: string }
  modifieLe: number
  connectes: number
}
export interface Membre { email: string; nom: string; role: Role }
export interface DocumentDetail {
  docId: string
  titre: string
  role: Role
  membres: Membre[]
  lienInvitation?: string
}
export interface Version {
  versionId: string
  numero?: string
  nom?: string
  type?: 'auto' | 'manuelle' | 'restauration'
  horodatage?: number
  creeLe?: number
  auteurs?: string[] | string
  auteur?: string
}
export interface LienResume { lienId: string; n: number; restants: number; etat: 'actif' | 'epuise' }
export interface LienPublic { titre: string; n: number; restants: number; etat: 'actif' | 'epuise' }
export type Demande =
  | { etat: 'pret'; ticket: string; expireA: number; restants: number; n: number }
  | { etat: 'patientez'; reessayerDans: number; restants?: number; n?: number }
  | { etat: 'epuise'; n?: number }
export interface TableauDeBord {
  documentsOuverts: { docId?: string; titre: string; principal?: string | { nom: string }; connectes: number }[]
  liensActifs: {
    lienId?: string; titre: string; creeParNom?: string; creePar?: string
    n: number; restants?: number; disponibles?: number
  }[]
  bloques: { nom?: string; email: string; motif?: string; bloqueJusqua: number }[]
}

export class ErreurApi extends Error {
  statut: number
  code: string
  constructor(statut: number, code: string, message: string) {
    super(message)
    this.statut = statut
    this.code = code
  }
}

export function lireJeton(): string | null {
  try { return localStorage.getItem(CLE_JETON) } catch { return null }
}
export function ecrireJeton(jeton: string | null) {
  try {
    if (jeton) localStorage.setItem(CLE_JETON, jeton)
    else localStorage.removeItem(CLE_JETON)
  } catch { /* stockage indisponible */ }
}

// Les chemins renvoyés par l'API sont relatifs (/invitation/…, /l/…) : on les rend absolus pour l'affichage et la copie.
export function urlAbsolue(chemin: string): string {
  return /^https?:\/\//.test(chemin) ? chemin : window.location.origin + chemin
}

interface Options { corps?: unknown; jeton?: boolean; admin?: string }

async function appel<T>(methode: string, chemin: string, o: Options = {}): Promise<T> {
  const entetes: Record<string, string> = {}
  if (o.corps !== undefined) entetes['Content-Type'] = 'application/json'
  const jeton = o.jeton === false ? null : lireJeton()
  if (jeton) entetes.Authorization = `Bearer ${jeton}`
  if (o.admin) entetes['x-code-admin'] = o.admin
  let rep: Response
  try {
    rep = await fetch('/api' + chemin, {
      method: methode,
      headers: entetes,
      body: o.corps !== undefined ? JSON.stringify(o.corps) : undefined,
    })
  } catch {
    throw new ErreurApi(0, 'reseau', 'Connexion impossible.')
  }
  if (!rep.ok) {
    let code = 'erreur'
    let message = 'Une erreur est survenue.'
    try {
      const j = await rep.json()
      code = j?.erreur?.code ?? code
      message = j?.erreur?.message ?? message
    } catch { /* corps vide */ }
    throw new ErreurApi(rep.status, code, message)
  }
  if (rep.status === 204) return undefined as T
  const texte = await rep.text()
  return (texte ? JSON.parse(texte) : undefined) as T
}

const enc = encodeURIComponent

export const api = {
  session: (nom: string, email: string) =>
    appel<{ jeton: string; redacteur: Redacteur }>('POST', '/session', { corps: { nom, email }, jeton: false }),
  moi: () => appel<Redacteur>('GET', '/moi'),
  documents: () => appel<DocumentResume[]>('GET', '/documents'),
  creerDocument: (titre: string) => appel<{ docId: string }>('POST', '/documents', { corps: { titre } }),
  document: (docId: string) => appel<DocumentDetail>('GET', `/documents/${enc(docId)}`),
  renommer: (docId: string, titre: string) => appel<void>('PATCH', `/documents/${enc(docId)}`, { corps: { titre } }),
  ajouterMembre: (docId: string, email: string) =>
    appel<void>('POST', `/documents/${enc(docId)}/membres`, { corps: { email } }),
  changerRole: (docId: string, email: string, role: 'proprietaire' | 'membre') =>
    appel<void>('PATCH', `/documents/${enc(docId)}/membres/${enc(email)}`, { corps: { role } }),
  regenererInvitation: (docId: string) =>
    appel<{ lienInvitation: string }>('POST', `/documents/${enc(docId)}/invitation`),
  accepterInvitation: (jeton: string) => appel<{ docId: string }>('POST', `/invitations/${enc(jeton)}`),
  versions: (docId: string) => appel<Version[]>('GET', `/documents/${enc(docId)}/versions`),
  version: (docId: string, versionId: string) =>
    appel<{ contenu: unknown }>('GET', `/documents/${enc(docId)}/versions/${enc(versionId)}`),
  creerLien: (docId: string, n: number) =>
    appel<{ lienId: string; url: string; n: number }>('POST', `/documents/${enc(docId)}/liens`, { corps: { n } }),
  liens: (docId: string) => appel<LienResume[]>('GET', `/documents/${enc(docId)}/liens`),
  lienPublic: (lienId: string) => appel<LienPublic>('GET', `/liens/${enc(lienId)}`, { jeton: false }),
  // 429 traité comme « patientez » (saturation)
  demander: async (lienId: string): Promise<Demande> => {
    try {
      return await appel<Demande>('POST', `/liens/${enc(lienId)}/demandes`, { jeton: false })
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 429) return { etat: 'patientez', reessayerDans: 2 }
      throw e
    }
  },
  urlFichier: (lienId: string, ticket: string) => `/api/liens/${enc(lienId)}/fichier?ticket=${enc(ticket)}`,
  tableauDeBord: (code: string) => appel<TableauDeBord>('GET', '/admin/tableau-de-bord', { admin: code, jeton: false }),
}

// Utilitaires d'affichage (fuseau WAT = UTC+1, comme le contrat).
const DECALAGE_WAT = 3600_000

export const CREDIT_JOURNALIER = 10_000
export const COULEURS_PRESENCE = ['#6b3fcf', '#c2410c', '#0f7a5a', '#1d63c9', '#b0206f', '#8a6100', '#007a8a', '#5b5473']

export function jourWat(ms: number): string {
  return new Date(ms + DECALAGE_WAT).toISOString().slice(0, 10)
}

export function heureWat(ms: number): string {
  return new Date(ms + DECALAGE_WAT).toISOString().slice(11, 16)
}

export function heureWatSecondes(ms: number): string {
  return new Date(ms + DECALAGE_WAT).toISOString().slice(11, 19)
}

// « demain à 00:00 (WAT) » ou « à 00:00 (WAT) »
export function texteRecharge(rechargeA: number): string {
  const demain = jourWat(rechargeA) !== jourWat(Date.now())
  return `${demain ? 'demain ' : ''}à ${heureWat(rechargeA)} (WAT)`
}

export function nombre(n: number): string {
  return n.toLocaleString('fr-FR')
}

export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase()
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase()
}

export function couleurPour(cle: string): string {
  let h = 0
  for (const c of cle) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COULEURS_PRESENCE[h % COULEURS_PRESENCE.length]
}

export function nomCourt(nom: string): string {
  const mots = nom.trim().split(/\s+/)
  return mots.length > 1 ? `${mots[0]} ${mots[mots.length - 1][0]}.` : nom
}

export function estEmailValide(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

export function tempsRelatif(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `le ${new Date(ms + DECALAGE_WAT).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`
}

export function dateHeure(ms: number): string {
  const j = jourWat(ms)
  const auj = jourWat(Date.now())
  const hier = jourWat(Date.now() - 86_400_000)
  const h = heureWat(ms)
  if (j === auj) return `Aujourd'hui, ${h}`
  if (j === hier) return `Hier, ${h}`
  return `${new Date(ms + DECALAGE_WAT).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}, ${h}`
}

export async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte)
    return true
  } catch {
    return false
  }
}

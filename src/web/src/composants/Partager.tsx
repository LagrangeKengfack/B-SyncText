import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ErreurApi, urlAbsolue, type DocumentDetail, type Membre } from '../api.ts'
import { copier, couleurPour, estEmailValide, nomCourt } from '../format.ts'
import { useSession } from '../session.tsx'
import { Avatar, Bandeau, Fenetre, Icone } from './commun.tsx'

const LIBELLE_ROLE = { principal: 'Propriétaire principal', proprietaire: 'Propriétaire', membre: 'Membre' } as const

// E-04 : partager le document (propriétaires).
export default function Partager({ docId, onFermer }: { docId: string; onFermer: () => void }) {
  const { redacteur } = useSession()
  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [email, setEmail] = useState('')
  const [erreur, setErreur] = useState('')
  const [regenere, setRegenere] = useState(false)
  const [copie, setCopie] = useState(false)

  const charger = useCallback(() => {
    api.document(docId).then(setDoc).catch((e) => setErreur(e instanceof ErreurApi ? e.message : 'Chargement impossible.'))
  }, [docId])
  useEffect(charger, [charger])

  const invalide = email.length > 0 && !estEmailValide(email)
  const moi = redacteur?.email
  const proprietaires = doc ? doc.membres.filter((m) => m.role !== 'membre').length : 0
  const suisPrincipal = doc?.role === 'principal'

  async function action(f: () => Promise<unknown>) {
    setErreur('')
    try { await f(); charger() } catch (e) { setErreur(e instanceof ErreurApi ? e.message : 'Action impossible.') }
  }

  async function donnerAcces(e: FormEvent) {
    e.preventDefault()
    if (!estEmailValide(email)) return
    await action(async () => { await api.ajouterMembre(docId, email.trim()); setEmail('') })
  }

  async function regenerer() {
    setErreur('')
    try {
      const r = await api.regenererInvitation(docId)
      setDoc((d) => (d ? { ...d, lienInvitation: r.lienInvitation } : d))
      setRegenere(true)
    } catch (e) { setErreur(e instanceof ErreurApi ? e.message : 'Action impossible.') }
  }

  const lien = doc?.lienInvitation ? urlAbsolue(doc.lienInvitation) : ''

  function ligne(m: Membre) {
    const c = couleurPour(m.email)
    const estMoi = m.email === moi
    return (
      <li className="membre" key={m.email}>
        <Avatar nom={m.nom} couleur={c} taille="l" titre={`${nomCourt(m.nom)}${estMoi ? ' (vous)' : ''}`} />
        <div className="membre__nom">{nomCourt(m.nom)}{estMoi && ' (vous)'} <span className={`role${m.role === 'principal' ? ' role--principal' : m.role === 'membre' ? ' role--membre' : ''}`}>{LIBELLE_ROLE[m.role]}</span></div>
        <div className="membre__actions">
          {estMoi && m.role !== 'membre' && (
            <button className="bouton bouton--secondaire bouton--petit" type="button" disabled={proprietaires < 2} aria-disabled={proprietaires < 2}
              aria-describedby={proprietaires < 2 ? 'renonce-aide' : undefined} onClick={() => action(() => api.changerRole(docId, m.email, 'membre'))}>Renoncer à mon rôle</button>
          )}
          {!estMoi && m.role === 'membre' && (
            <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => action(() => api.changerRole(docId, m.email, 'proprietaire'))}>Nommer propriétaire</button>
          )}
          {!estMoi && m.role === 'proprietaire' && suisPrincipal && (
            <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => action(() => api.changerRole(docId, m.email, 'membre'))}>Retirer le rôle</button>
          )}
        </div>
        {estMoi && m.role !== 'membre' && proprietaires < 2 && (
          <p className="champ__aide" id="renonce-aide" style={{ gridColumn: '1 / -1', margin: 0 }}><Icone nom="info" /> Vous êtes le seul propriétaire : nommez d'abord un autre propriétaire pour pouvoir renoncer.</p>
        )}
      </li>
    )
  }

  return (
    <Fenetre titreId="titre-partage" titre="Partager le document" onFermer={onFermer}>
      <form className={`champ${invalide ? ' champ--erreur' : ''}`} onSubmit={donnerAcces} noValidate>
        <label htmlFor="inv">Donner accès à une personne</label>
        <div className="champ__ligne">
          <input id="inv" type="email" placeholder="prenom.nom@univ-exemple.fr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalide || undefined} aria-describedby={invalide ? 'inv-err' : 'inv-aide'} />
          <button className="bouton bouton--principal" type="submit" disabled={!estEmailValide(email)} aria-disabled={!estEmailValide(email)}>Donner accès</button>
        </div>
        {invalide
          ? <span className="champ__erreur" id="inv-err"><Icone nom="alerte" /> Cet e-mail est incomplet. Exemple : prenom.nom@univ-exemple.fr</span>
          : <span className="champ__aide" id="inv-aide">Le document apparaîtra dans sa liste dès sa première visite. Aucun e-mail n'est envoyé.</span>}
      </form>
      {erreur && <p className="champ__erreur" role="alert">{erreur}</p>}

      <div className="lien-ligne">
        {regenere && (
          <Bandeau type="succes" icone="check" role="status" titre="Nouveau lien créé">
            L'ancien lien affiche désormais « invitation expirée ». Pensez à diffuser le nouveau.
          </Bandeau>
        )}
        <div className="champ">
          <label htmlFor="lien-inv">Lien d'invitation</label>
          <div className="adresse">
            <span className="code" id="lien-inv">{lien}</span>
            <button className="bouton bouton--principal bouton--petit" type="button" disabled={!lien}
              onClick={async () => { setCopie(await copier(lien)); setTimeout(() => setCopie(false), 2000) }}>
              <Icone nom="copier" />{copie ? 'Copié' : 'Copier'}
            </button>
          </div>
          <span className="champ__aide">Qui ouvre ce lien entre son nom et son e-mail, puis écrit comme membre. Pratique pour inviter beaucoup de monde.</span>
        </div>
        <div className="ligne">
          <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={regenerer}><Icone nom="actualiser" />Régénérer le lien</button>
          <span className="tres-petit doux">L'ancien lien cesse de fonctionner.</span>
        </div>
      </div>
      <div>
        <h3 style={{ marginBottom: 'var(--e-2)' }}>Personnes ayant accès</h3>
        <ul className="liste-docs" style={{ gap: 0 }} aria-label="Membres">{doc?.membres.map(ligne)}</ul>
        <p className="tres-petit doux" style={{ marginTop: 'var(--e-3)' }}>Seuls les propriétaires peuvent donner accès et nommer. Seul le principal peut retirer le rôle d'un propriétaire.</p>
      </div>
    </Fenetre>
  )
}

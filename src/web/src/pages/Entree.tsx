import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ErreurApi } from '../api.ts'
import { Bandeau, Icone } from '../composants/commun.tsx'
import { estEmailValide } from '../format.ts'
import { useSession } from '../session.tsx'

// E-01 : entrée, et variante « arrivée par invitation ».
export default function Entree() {
  const { jeton: jetonInvitation } = useParams()
  const { jeton, redacteur, pret, entrer } = useSession()
  const nav = useNavigate()
  const [nom, setNom] = useState('')
  const [mail, setMail] = useState('')
  const [expiree, setExpiree] = useState(false)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const invitationFaite = useRef(false)

  useEffect(() => {
    if (redacteur) { setNom((n) => n || redacteur.nom); setMail((m) => m || redacteur.email) }
  }, [redacteur])

  // Déjà connecté : sans invitation, aller aux documents ; avec invitation, la rejoindre tout de suite.
  useEffect(() => {
    if (!pret || !jeton) return
    if (!jetonInvitation) { nav('/documents', { replace: true }); return }
    if (invitationFaite.current) return
    invitationFaite.current = true
    api.accepterInvitation(jetonInvitation)
      .then((r) => nav(`/documents/${r.docId}`, { replace: true }))
      .catch(() => setExpiree(true))
  }, [pret, jeton, jetonInvitation, nav])

  const emailInvalide = mail.length > 0 && !estEmailValide(mail)
  const peutEnvoyer = nom.trim().length > 0 && estEmailValide(mail) && !envoi

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!peutEnvoyer) return
    setEnvoi(true)
    setErreur('')
    try {
      if (!jeton) await entrer(nom.trim(), mail.trim())
      if (jetonInvitation && !expiree) {
        try {
          const r = await api.accepterInvitation(jetonInvitation)
          nav(`/documents/${r.docId}`)
          return
        } catch (e2) {
          if (e2 instanceof ErreurApi && (e2.statut === 410 || e2.statut === 404)) { setExpiree(true); setEnvoi(false); return }
          throw e2
        }
      }
      nav('/documents')
    } catch (e2) {
      setErreur(e2 instanceof ErreurApi ? e2.message : 'Connexion impossible.')
      setEnvoi(false)
    }
  }

  const invitation = !!jetonInvitation && !expiree
  return (
    <div className="fond-degrade-page" style={{ background: 'linear-gradient(135deg, var(--violet-200) 0%, var(--violet-50) 45%, var(--accent-doux) 100%) fixed' }}>
      <main className="conteneur conteneur--etroit page-centree">
        <div className="pile pile--l">
          <div className="centre pile--s" style={{ display: 'grid', justifyItems: 'center' }}>
            <span className="marque marque--grande"><img src="/logo-clair.svg" alt="" />B-SyncText</span>
            <p className="slogan">Créez sans effort. Modifiez en temps réel. Synchronisez en un instant.</p>
          </div>
          <div className="carte pile">
            {invitation && (
              <Bandeau icone="document" titre="Vous êtes invité à écrire dans un document">
                Entrez votre nom et votre e-mail pour rejoindre le document.
              </Bandeau>
            )}
            {expiree && (
              <Bandeau type="erreur" icone="alerte" role="alert" titre="Cette invitation a expiré">
                Le lien a été remplacé par un nouveau. Demandez à la personne qui vous a invité de vous envoyer le lien à jour. Vous pouvez quand même entrer pour retrouver vos documents.
              </Bandeau>
            )}
            <h1 style={{ margin: 0, fontSize: 'var(--t-xl)' }}>{invitation ? 'Rejoindre le document' : 'Entrer dans B-SyncText'}</h1>
            <form className="pile" onSubmit={soumettre} noValidate>
              <div className="champ">
                <label htmlFor="nom">Votre nom</label>
                <input id="nom" name="nom" autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} />
                <span className="champ__aide">Ce nom est affiché aux autres rédacteurs.</span>
              </div>
              <div className={`champ${emailInvalide ? ' champ--erreur' : ''}`}>
                <label htmlFor="mail">Votre e-mail</label>
                <input id="mail" name="mail" type="email" autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)}
                  aria-invalid={emailInvalide || undefined} aria-describedby={emailInvalide ? 'mail-err' : 'mail-aide'} />
                {emailInvalide ? (
                  <span className="champ__erreur" id="mail-err"><Icone nom="alerte" /> Cet e-mail est incomplet. Exemple : prenom.nom@univ-exemple.fr</span>
                ) : (
                  <span className="champ__aide" id="mail-aide">Il sert d'identifiant. Aucun mot de passe, aucun e-mail envoyé.</span>
                )}
              </div>
              {erreur && <p className="champ__erreur" role="alert">{erreur}</p>}
              <button className="bouton bouton--principal bouton--plein" type="submit" disabled={!peutEnvoyer} aria-disabled={!peutEnvoyer}>
                {invitation ? 'Entrer et rejoindre' : 'Entrer'}
              </button>
            </form>
            <p className="tres-petit doux centre" style={{ margin: 0 }}>Vos documents sont retrouvés grâce à votre e-mail, sur tous vos appareils.</p>
          </div>
        </div>
      </main>
    </div>
  )
}

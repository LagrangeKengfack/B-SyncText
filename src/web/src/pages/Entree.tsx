import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ErreurApi } from '../api.ts'
import { Barre, Icone, Marque, useClasseBody } from '../composants/commun.tsx'
import { estEmailValide } from '../format.ts'
import { useSession } from '../session.tsx'

// E-01 : accueil + fenêtre de connexion, et variantes « arrivée par invitation » / « invitation expirée ».
export default function Entree() {
  const { jeton: jetonInvitation } = useParams()
  const { jeton, redacteur, pret, entrer } = useSession()
  const nav = useNavigate()
  const [nom, setNom] = useState('')
  const [mail, setMail] = useState('')
  const [expiree, setExpiree] = useState(false)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [ouvert, setOuvert] = useState(!!jetonInvitation)
  const invitationFaite = useRef(false)
  useClasseBody('accueil')

  useEffect(() => {
    if (redacteur) { setNom((n) => n || redacteur.nom); setMail((m) => m || redacteur.email) }
  }, [redacteur])

  // Une invitation expirée ouvre la fenêtre pour l'expliquer.
  useEffect(() => { if (expiree) setOuvert(true) }, [expiree])

  // Échap ferme la fenêtre.
  useEffect(() => {
    if (!ouvert) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [ouvert])

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
  const chapeau = invitation
    ? "Vous êtes invité à écrire dans un document. Entrez votre nom et votre e-mail pour rejoindre le document."
    : 'Entrez votre nom et votre e-mail pour écrire avec votre équipe.'

  return (
    <>
      <div className="accueil__bandes" aria-hidden="true"></div>

      <header className="barre-app">
        <div className="barre-app__contenu">
          <Marque vers="/" />
          <span className="espace"></span>
          <nav className="nav-pilules" aria-label="Sur cette page">
            <a href="#ecrire">Écrire</a><a href="#versions">Versions</a><a href="#diffuser">Diffuser</a>
          </nav>
          <span className="espace"></span>
          <button className="bouton bouton--sombre" type="button" onClick={() => setOuvert(true)}><Icone nom="utilisateur" />Se connecter</button>
        </div>
      </header>

      <main>
        <section className="accueil__hero">
          <div className="accueil__texte">
            <span className="surtitre" style={{ fontSize: '0.75rem', letterSpacing: '0.1em' }}>L'éditeur de texte qui vous connecte en temps réel</span>
            <h1>Un seul espace de travail pour documenter vos projets <em>ensemble</em>.</h1>
            <p className="accueil__intro">B-SyncText réunit votre équipe sur un même texte, garde chaque version et remet le PDF à tous vos lecteurs, quand vous le décidez.</p>
            <p className="slogan">Créez sans effort. Modifiez en temps réel. Synchronisez en un instant.</p>
            <div className="ligne">
              <button className="bouton bouton--principal bouton--grand" type="button" onClick={() => setOuvert(true)}>Se connecter</button>
            </div>
            <ul className="accueil__preuves">
              <li><Icone nom="check" />Aucun compte à créer</li>
              <li><Icone nom="check" />Un nom et un e-mail suffisent</li>
              <li><Icone nom="check" />Lecteurs sans identité</li>
            </ul>
          </div>

          <div className="accueil__scene" aria-hidden="true">
            <span className="etincelle accueil__etoile accueil__etoile--2"></span>
            <div className="accueil__page">
              <h2>Édito : une rentrée qui se lit</h2>
              <p>Cette année encore, la rentrée a eu son lot de surprises : la nouvelle salle de lecture, les files d'attente du restaurant universitaire et, surtout, ce besoin de se raconter.<span className="curseur" data-nom="Idriss M." style={{ '--c': 'var(--presence-2)' } as React.CSSProperties}></span></p>
              <p>Ce numéro est le fruit de trois cents plumes, et chacune a sa manière de dire l'automne. Un étudiant en droit y a rédigé la moitié de son mémoire entre deux et quatre heures du matin.<span className="curseur" data-nom="Sarah L." style={{ '--c': 'var(--presence-3)' } as React.CSSProperties}></span></p>
            </div>
            <div className="carte-flottante carte-flottante--1"><span className="carte-flottante__icone"><Icone nom="personnes" /></span><span><strong>4 personnes écrivent</strong>en ce moment</span></div>
            <div className="carte-flottante carte-flottante--2"><span className="carte-flottante__icone"><Icone nom="historique" /></span><span><strong>Version v3 enregistrée</strong>il y a 2 minutes</span></div>
            <div className="carte-flottante carte-flottante--3"><span className="carte-flottante__icone"><Icone nom="telecharger" /></span><span><strong>83 exemplaires restants</strong>sur 500<Barre pourcent={17} rayee libelle="17 % distribués" /></span></div>
            <div className="carte-flottante carte-flottante--4"><span className="carte-flottante__icone"><Icone nom="crayon" /></span><span><strong>Idriss M.</strong>a ajouté un paragraphe</span></div>
            <span className="etincelle accueil__etoile"></span>
          </div>
        </section>

        <section className="conteneur" style={{ paddingBottom: 'var(--e-9)' }}>
          <div className="tuiles">
            <div className="tuile" id="ecrire"><span className="tuile__icone"><Icone nom="crayon" /></span><h3>Écrivez à plusieurs</h3><p className="tuile__nom">Voyez qui est là et où chacun écrit. Deux personnes au même endroit : aucune modification n'est perdue.</p></div>
            <div className="tuile" id="versions"><span className="tuile__icone"><Icone nom="historique" /></span><h3>Gardez chaque version</h3><p className="tuile__nom">v1, v2, v3.1… Retrouvez un état précis du texte et restaurez-le sans rien perdre.</p></div>
            <div className="tuile" id="diffuser"><span className="tuile__icone"><Icone nom="telecharger" /></span><h3>Diffusez le PDF</h3><p className="tuile__nom">Un lien, un nombre d'exemplaires. Chaque lecteur sait s'il télécharge, s'il patiente ou si le lien est épuisé.</p></div>
          </div>
        </section>
      </main>

      {ouvert && (
        <div className="modale-fond">
          <div className="modale" role="dialog" aria-modal="true" aria-labelledby="titre-connexion">
            <button className="bouton-rond modale__fermer" type="button" aria-label="Fermer" onClick={() => setOuvert(false)}><Icone nom="fermer" /></button>
            <div className="modale__tete">
              <img src="/logo-clair.svg" alt="" />
              <h2>B-SyncText</h2>
              <p>{chapeau}</p>
            </div>
            <div className="modale__corps">
              <h3 id="titre-connexion">Se connecter</h3>

              {expiree && (
                <div className="bandeau bandeau--erreur" role="alert">
                  <Icone nom="alerte" />
                  <div className="bandeau__corps"><strong>Cette invitation a expiré</strong><span>Le lien a été remplacé. Demandez à la personne qui vous a invité de vous envoyer le nouveau. Vous pouvez quand même entrer pour retrouver vos documents.</span></div>
                </div>
              )}

              <form className="pile" onSubmit={soumettre} noValidate>
                <div className="champ champ--pilule">
                  <label className="sr-seulement" htmlFor="nom">Votre nom</label>
                  <div className="champ__avec-icone"><Icone nom="utilisateur" /><input id="nom" name="nom" autoComplete="name" placeholder="Votre nom" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus /></div>
                </div>
                <div className={`champ champ--pilule${emailInvalide ? ' champ--erreur' : ''}`}>
                  <label className="sr-seulement" htmlFor="mail">Votre e-mail</label>
                  <div className="champ__avec-icone"><Icone nom="mail" /><input id="mail" name="mail" type="email" autoComplete="email" placeholder="Votre e-mail" value={mail} onChange={(e) => setMail(e.target.value)}
                    aria-invalid={emailInvalide || undefined} aria-describedby={emailInvalide ? 'mail-err' : 'mail-aide'} /></div>
                  {emailInvalide ? (
                    <span className="champ__erreur" id="mail-err"><Icone nom="alerte" /> Cet e-mail est incomplet. Exemple : prenom.nom@univ-exemple.fr</span>
                  ) : (
                    <span className="champ__aide" id="mail-aide">Il sert d'identifiant. Aucun mot de passe, aucun e-mail envoyé.</span>
                  )}
                </div>
                {erreur && <p className="champ__erreur" role="alert">{erreur}</p>}
                <button className="bouton bouton--principal bouton--plein bouton--grand" type="submit" disabled={!peutEnvoyer} aria-disabled={!peutEnvoyer}>
                  {invitation ? 'Entrer et rejoindre' : 'Entrer'}
                </button>
              </form>
              <p className="tres-petit doux centre">Vos documents vous suivent sur tous vos appareils grâce à votre e-mail.</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, ErreurApi } from '../api.ts'
import { Icone } from '../composants/commun.tsx'
import { heureWatSecondes, nombre } from '../format.ts'

type Etat =
  | { nom: 'chargement' }
  | { nom: 'pret'; url: string; restants: number; n: number }
  | { nom: 'patientez'; derniere: number }
  | { nom: 'epuise'; n?: number }
  | { nom: 'introuvable' }

// E-07 : page publique, aucune identité demandée, aucun jeton envoyé.
export default function Telechargement() {
  const { lienId = '' } = useParams()
  const [titre, setTitre] = useState('')
  const [etat, setEtat] = useState<Etat>({ nom: 'chargement' })
  const demarre = useRef<string | null>(null)

  useEffect(() => {
    // Une seule boucle par lien (StrictMode relance les effets en dev : une demande consomme un exemplaire).
    if (demarre.current === lienId) return
    demarre.current = lienId
    let minuteur: ReturnType<typeof setTimeout> | undefined
    let vivant = true

    const demander = async () => {
      try {
        const r = await api.demander(lienId)
        if (!vivant) return
        if (r.etat === 'pret') {
          const url = api.urlFichier(lienId, r.ticket)
          setEtat({ nom: 'pret', url, restants: r.restants, n: r.n })
          window.location.href = url // téléchargement automatique
        } else if (r.etat === 'epuise') {
          setEtat({ nom: 'epuise', n: r.n })
        } else {
          setEtat({ nom: 'patientez', derniere: Date.now() })
          reessayer(r.reessayerDans)
        }
      } catch (e) {
        if (!vivant) return
        if (e instanceof ErreurApi && e.statut === 404) { setEtat({ nom: 'introuvable' }); return }
        // Erreur réseau ou serveur : le visiteur reste dans « patientez », jamais sans réponse.
        setEtat({ nom: 'patientez', derniere: Date.now() })
        reessayer(3)
      }
    }
    const reessayer = (secondes: number) => {
      minuteur = setTimeout(demander, Math.max(1, secondes) * 1000 + Math.random() * 500)
    }

    api.lienPublic(lienId)
      .then((l) => {
        if (!vivant) return
        setTitre(l.titre)
        if (l.etat === 'epuise') setEtat({ nom: 'epuise', n: l.n })
        else void demander()
      })
      .catch((e) => {
        if (!vivant) return
        if (e instanceof ErreurApi && e.statut === 404) setEtat({ nom: 'introuvable' })
        else void demander()
      })
    return () => { vivant = false; clearTimeout(minuteur); demarre.current = null }
  }, [lienId])

  return (
    <>
      <header className="entete-app">
        <div className="entete-app__contenu">
          <span className="marque"><img src="/favicon.svg" alt="" />B-SyncText</span>
        </div>
      </header>
      <main className="conteneur conteneur--moyen page-centree">
        <div className="carte" style={{ padding: 0 }}>
          {titre && etat.nom !== 'introuvable' && (
            <div className="ligne" style={{ padding: 'var(--e-4) var(--e-5)', borderBottom: '1px solid var(--bordure)' }}>
              <i className="ico ico-document" aria-hidden="true" style={{ width: 28, height: 28, color: 'var(--violet-700)' }}></i>
              <div>
                <div className="gras">{titre}</div>
                <div className="tres-petit doux">PDF</div>
              </div>
            </div>
          )}
          <div role="status" aria-live="polite">
            {etat.nom === 'chargement' && (
              <section className="etat-public">
                <div className="etat-public__icone etat-public__icone--attente"><Icone nom="hourglass" /></div>
                <h1>Un instant…</h1>
                <div className="attente-anim" aria-hidden="true"></div>
              </section>
            )}
            {etat.nom === 'pret' && (
              <section className="etat-public">
                <div className="etat-public__icone etat-public__icone--succes"><Icone nom="check" /></div>
                <span className="numero">{nombre(etat.restants)} restant{etat.restants > 1 ? 's' : ''} sur {nombre(etat.n)}</span>
                <h1>Votre exemplaire est prêt</h1>
                <p className="etat-public__texte">Le téléchargement du PDF démarre tout seul. Vous recevez le journal tel qu'il est à cet instant.</p>
                <a className="bouton bouton--principal bouton--grand" href={etat.url}><Icone nom="telecharger" />Télécharger le PDF</a>
                <p className="tres-petit doux" style={{ margin: 0 }}>Si rien ne se passe, utilisez ce bouton. Il vous est réservé pendant 60 secondes et ne sert qu'une seule fois.</p>
              </section>
            )}
            {etat.nom === 'patientez' && (
              <section className="etat-public">
                <div className="etat-public__icone etat-public__icone--attente"><Icone nom="hourglass" /></div>
                <h1>Patientez, c'est bientôt votre tour</h1>
                <p className="etat-public__texte">Beaucoup de personnes téléchargent en même temps. Nous réessayons à votre place.</p>
                <div className="attente-anim" aria-hidden="true"></div>
                <p className="petit doux" style={{ margin: 0 }}><strong>Gardez cette page ouverte.</strong> Elle se met à jour toute seule : inutile de recharger ou de recliquer.</p>
                <p className="tres-petit doux" style={{ margin: 0 }}>Dernière vérification : {heureWatSecondes(etat.derniere)} (WAT)</p>
              </section>
            )}
            {etat.nom === 'epuise' && (
              <section className="etat-public">
                <div className="etat-public__icone etat-public__icone--epuise"><Icone nom="interdit" /></div>
                <h1>Ce lien n'a plus d'exemplaire</h1>
                <p className="etat-public__texte">{etat.n ? `Les ${nombre(etat.n)} exemplaires ont tous été téléchargés.` : 'Tous les exemplaires ont été téléchargés.'} Nous sommes désolés de ne pas pouvoir vous en donner un.</p>
                <p className="petit doux" style={{ margin: 0 }}>Écrivez à l'association pour demander un nouveau lien.</p>
              </section>
            )}
            {etat.nom === 'introuvable' && (
              <section className="etat-public">
                <div className="etat-public__icone etat-public__icone--erreur"><Icone nom="alerte" /></div>
                <h1>Lien introuvable</h1>
                <p className="etat-public__texte">Cette adresse ne correspond à aucun document. Vérifiez qu'elle est complète, ou redemandez le lien à la personne qui vous l'a envoyé.</p>
              </section>
            )}
          </div>
        </div>
        <p className="pied-public">Aucune information personnelle n'est demandée pour télécharger.</p>
      </main>
    </>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ErreurApi, type DocumentResume } from '../api.ts'
import { BandeauxGlobaux, EnteteApp, Icone } from '../composants/commun.tsx'
import { nomCourt, tempsRelatif } from '../format.ts'
import { useSession } from '../session.tsx'

function nomPrincipal(d: DocumentResume): string {
  return typeof d.principal === 'string' ? d.principal : d.principal?.nom ?? ''
}

// E-02 : mes documents.
export default function Documents() {
  const { redacteur } = useSession()
  const nav = useNavigate()
  const [docs, setDocs] = useState<DocumentResume[] | null>(null)
  const [erreur, setErreur] = useState('')
  const [creation, setCreation] = useState(false)
  const [titre, setTitre] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    let actif = true
    api.documents().then((d) => { if (actif) setDocs(d) }).catch((e) => {
      if (actif) setErreur(e instanceof ErreurApi ? e.message : 'Chargement impossible.')
    })
    return () => { actif = false }
  }, [])

  async function creer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    try {
      const r = await api.creerDocument(titre.trim() || 'Document sans titre')
      nav(`/documents/${r.docId}`)
    } catch (e2) {
      setErreur(e2 instanceof ErreurApi ? e2.message : 'Création impossible.')
      setEnvoi(false)
    }
  }

  const boutonCreer = (texte: string) => (
    <button className="bouton bouton--principal" type="button" onClick={() => setCreation(true)}><Icone nom="plus" />{texte}</button>
  )

  return (
    <>
      <BandeauxGlobaux />
      <EnteteApp avecCredit />
      <main className="conteneur" style={{ paddingTop: 'var(--e-6)', paddingBottom: 'var(--e-7)' }}>
        <div className="ligne ligne--entre" style={{ marginBottom: 'var(--e-5)' }}>
          <h1 style={{ margin: 0 }}>Mes documents</h1>
          {docs && docs.length > 0 && boutonCreer('Nouveau document')}
        </div>
        {erreur && <p className="champ__erreur" role="alert">{erreur}</p>}
        {creation && (
          <form className="carte champ" onSubmit={creer} style={{ marginBottom: 'var(--e-5)' }}>
            <label htmlFor="titre-nouveau">Titre du document</label>
            <div className="champ__ligne">
              <input id="titre-nouveau" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. : Le Bulletin — Octobre 2026" autoFocus />
              <button className="bouton bouton--principal" type="submit" disabled={envoi}>Créer</button>
              <button className="bouton bouton--secondaire" type="button" onClick={() => setCreation(false)}>Annuler</button>
            </div>
          </form>
        )}
        {docs && docs.length === 0 && (
          <section className="carte carte--vide pile" style={{ justifyItems: 'center' }}>
            <Icone nom="document" />
            <h2 style={{ margin: 0 }}>Vous n'avez encore aucun document</h2>
            <p className="doux" style={{ margin: 0, maxWidth: '40ch' }}>Créez un document pour commencer à écrire, ou ouvrez le lien d'invitation qu'on vous a envoyé : le document apparaîtra ici.</p>
            {boutonCreer('Créer mon premier document')}
          </section>
        )}
        {docs && docs.length > 0 && (
          <ul className="liste-docs liste-docs--large" aria-label="Documents auxquels vous avez accès">
            {docs.map((d) => {
              const moi = d.role === 'principal'
              return (
                <li className="doc" key={d.docId}>
                  <div className="pile--s">
                    <Link className="doc__titre" to={`/documents/${d.docId}`}>{d.titre}</Link>
                    <div className="doc__meta">
                      <span>Créé par <strong>{moi ? nomCourt(redacteur?.nom ?? '') : nomCourt(nomPrincipal(d))}</strong>{moi && <span className="role role--principal">vous</span>}</span>
                      {d.modifieLe ? <span><Icone nom="horloge" />Modifié {tempsRelatif(d.modifieLe)}</span> : null}
                    </div>
                  </div>
                  <span className="pastille" style={{ '--c': d.connectes > 0 ? 'var(--succes-texte)' : 'var(--bordure-champ)' } as React.CSSProperties}>
                    <Icone nom="personnes" />{d.connectes} connecté{d.connectes > 1 ? 's' : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {!docs && !erreur && <p className="doux" role="status">Chargement…</p>}
      </main>
    </>
  )
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ErreurApi, type DocumentResume, type FormatVersion } from '../api.ts'
import { BandeauxGlobaux, EnteteApp, Fenetre, Icone } from '../composants/commun.tsx'
import { dateLongue, nombre, nomCourt, prenom, tempsRelatif, CREDIT_JOURNALIER, texteRecharge } from '../format.ts'
import { useSession } from '../session.tsx'

type Filtre = 'tous' | 'mes' | 'partages'
const FORMATS: { v: FormatVersion; exemple: string }[] = [
  { v: 'v.x', exemple: 'v1, v2, v3…' },
  { v: 'v.x.x', exemple: 'v1.0, v1.1, v2.0…' },
  { v: 'v.x.x.x', exemple: 'v1.0.0, v1.0.1, v1.1.0, v2.0.0…' },
]

function principalDe(d: DocumentResume): { nom: string; email?: string } | null {
  if (!d.principal) return null
  return typeof d.principal === 'string' ? { nom: d.principal } : d.principal
}

// E-02 : mes documents.
export default function Documents() {
  const { redacteur } = useSession()
  const nav = useNavigate()
  const [docs, setDocs] = useState<DocumentResume[] | null>(null)
  const [erreur, setErreur] = useState('')
  const [creation, setCreation] = useState(false)
  const [titre, setTitre] = useState('')
  const [format, setFormat] = useState<FormatVersion>('v.x')
  const [envoi, setEnvoi] = useState(false)
  const [filtre, setFiltre] = useState<Filtre>('tous')

  useEffect(() => {
    let actif = true
    api.documents().then((d) => { if (actif) setDocs(d) }).catch((e) => {
      if (actif) setErreur(e instanceof ErreurApi ? e.message : 'Chargement impossible.')
    })
    return () => { actif = false }
  }, [])

  // « Mes documents » = ceux que la personne a créés (propriétaire principal).
  const estMien = (d: DocumentResume) => d.role === 'principal'
  const listes = useMemo(() => {
    const tous = docs ?? []
    return { tous, mes: tous.filter(estMien), partages: tous.filter((d) => !estMien(d)) }
  }, [docs])
  const affiches = listes[filtre]

  function ouvrirCreation() { setTitre(''); setFormat('v.x'); setCreation(true) }

  async function creer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    try {
      const r = await api.creerDocument(titre.trim() || 'Document sans titre', format)
      nav(`/documents/${r.docId}`)
    } catch (e2) {
      setErreur(e2 instanceof ErreurApi ? e2.message : 'Création impossible.')
      setCreation(false)
      setEnvoi(false)
    }
  }

  const credit = redacteur?.credit
  const connectes = (docs ?? []).reduce((s, d) => s + (d.connectes || 0), 0)
  const titreListe = filtre === 'mes' ? 'Mes documents' : filtre === 'partages' ? 'Partagés avec moi' : 'Tous les documents'
  const vide = docs !== null && docs.length === 0

  return (
    <>
      <BandeauxGlobaux />
      <EnteteApp />
      <main className="conteneur pile--l pile" style={{ paddingTop: 'var(--e-5)', paddingBottom: 'var(--e-9)' }}>
        <div className="ligne ligne--entre ligne--haut">
          <div className="salutation">
            <span className="petit">{dateLongue(Date.now())}</span>
            <h1 className="titre-page">Bonjour, {prenom(redacteur?.nom ?? '')}.</h1>
            <p className="doux">Vos documents et ceux de vos équipes, au même endroit.</p>
          </div>
          <button className="bouton bouton--principal bouton--grand" type="button" onClick={ouvrirCreation}><Icone nom="plus" />Nouveau document</button>
        </div>

        {erreur && <p className="champ__erreur" role="alert">{erreur}</p>}

        {!vide && (
          <div className="tuiles">
            <div className="tuile tuile--ligne"><span className="tuile__icone"><Icone nom="documents" /></span><span className="tuile__valeur">{listes.tous.length}</span><span className="tuile__nom">document{listes.tous.length > 1 ? 's' : ''} auxquels vous avez accès</span></div>
            <div className="tuile tuile--ligne"><span className="tuile__icone"><Icone nom="personnes" /></span><span className="tuile__valeur">{connectes}</span><span className="tuile__nom">personne{connectes > 1 ? 's' : ''} connectée{connectes > 1 ? 's' : ''} dans vos documents</span></div>
            {credit && <div className="tuile tuile--ligne"><span className="tuile__icone"><Icone nom="crayon" /></span><span className="tuile__valeur">{nombre(credit.restant)} <small>/ {nombre(CREDIT_JOURNALIER)}</small></span><span className="tuile__nom">caractères restants aujourd'hui · recharge {texteRecharge(credit.rechargeA).replace(/^demain /, '').replace('', '')}</span></div>}
          </div>
        )}

        {docs && !vide && (
          <section className="pile" aria-labelledby="t-docs">
            <div className="ligne ligne--entre">
              <h2 id="t-docs">{titreListe}</h2>
              <div className="filtres" role="group" aria-label="Filtrer les documents">
                <button type="button" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}>Tous <span className="filtres__n">{listes.tous.length}</span></button>
                <button type="button" aria-pressed={filtre === 'mes'} onClick={() => setFiltre('mes')}>Mes documents <span className="filtres__n">{listes.mes.length}</span></button>
                <button type="button" aria-pressed={filtre === 'partages'} onClick={() => setFiltre('partages')}>Partagés avec moi <span className="filtres__n">{listes.partages.length}</span></button>
              </div>
            </div>
            <ul className="liste-docs grille-docs">
              {filtre !== 'partages' && (
                <li><button className="doc-carte doc-carte--nouveau" type="button" onClick={ouvrirCreation} style={{ width: '100%', font: 'inherit', cursor: 'pointer' }}>
                  <span className="doc-carte--nouveau__rond"><Icone nom="plus" /></span>Nouveau document
                  <span className="doux petit" style={{ fontWeight: 500 }}>Un titre et un format de version</span></button></li>
              )}
              {affiches.map((d) => {
                const p = principalDe(d)
                const moi = estMien(d) || (!!p?.email && p.email === redacteur?.email)
                return (
                  <li className="doc-carte" key={d.docId}>
                    <Link className="doc-vignette" to={`/documents/${d.docId}`} aria-hidden="true" tabIndex={-1}>
                      <div className="doc-vignette__page"><b>{d.titre}</b><i className="vignette-ligne"></i><i className="vignette-ligne" style={{ width: '88%' }}></i><i className="vignette-ligne" style={{ width: '70%' }}></i><i className="vignette-ligne" style={{ width: '80%' }}></i></div>
                      {d.connectes > 0 && <span className="etat etat--succes doc-vignette__live"><Icone nom="personnes" />{d.connectes} en ligne</span>}
                    </Link>
                    <div className="doc-carte__corps">
                      <Link className="doc-carte__titre" to={`/documents/${d.docId}`}>{d.titre}</Link>
                      <div className="doc-carte__meta">
                        <span>Créé par <strong>{moi ? nomCourt(redacteur?.nom ?? '') : p ? nomCourt(p.nom) : '—'}</strong>{' '}
                          <span className={`role ${moi ? 'role--principal' : 'role--membre'}`}>{moi ? 'vous' : 'partagé'}</span></span>
                        {d.modifieLe ? <span>Modifié {tempsRelatif(d.modifieLe)}</span> : null}
                      </div>
                      <div className="doc-carte__pied"><span className="avatars"></span><span>{d.connectes} connecté{d.connectes > 1 ? 's' : ''}</span></div>
                    </div>
                  </li>
                )
              })}
            </ul>
            {affiches.length === 0 && <p className="doux" role="status">Aucun document dans cette liste.</p>}
          </section>
        )}

        {vide && (
          <section className="carte vide">
            <div className="vide__image" aria-hidden="true"></div>
            <h2>Votre premier document commence ici</h2>
            <p>Créez un document pour commencer à écrire, ou ouvrez le lien d'invitation qu'on vous a envoyé : le document apparaîtra dans cette page.</p>
            <button className="bouton bouton--principal bouton--grand" type="button" onClick={ouvrirCreation}><Icone nom="plus" />Créer mon premier document</button>
          </section>
        )}
        {!docs && !erreur && <p className="doux" role="status">Chargement…</p>}
      </main>

      {creation && (
        <Fenetre titreId="titre-nouveau" titre="Nouveau document" onFermer={() => setCreation(false)} largeur={560}>
          <form className="pile pile--l" onSubmit={creer}>
            <div className="champ">
              <label htmlFor="titre-doc">Titre du document</label>
              <input id="titre-doc" placeholder="Ex. : Compte rendu de la réunion" autoComplete="off" value={titre} onChange={(e) => setTitre(e.target.value)} />
            </div>
            <fieldset className="format-version">
              <legend>Numérotation des versions</legend>
              <p className="champ__aide">Ce choix est définitif : le format ne pourra plus être changé après la création.</p>
              {FORMATS.map((f) => (
                <label className="format-version__option" key={f.v}>
                  <input type="radio" name="format" value={f.v} checked={format === f.v} onChange={() => setFormat(f.v)} />
                  <span><strong>{f.v}</strong><em>{f.exemple}</em></span>
                </label>
              ))}
            </fieldset>
            <div className="fenetre__pied">
              <button className="bouton bouton--secondaire" type="button" onClick={() => setCreation(false)}>Annuler</button>
              <button className="bouton bouton--principal" type="submit" disabled={envoi}>Créer le document</button>
            </div>
          </form>
        </Fenetre>
      )}
    </>
  )
}

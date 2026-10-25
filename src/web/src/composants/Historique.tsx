import { useState, type FormEvent } from 'react'
import type { Version } from '../api.ts'
import { dateHeure } from '../format.ts'
import { Bandeau, Icone } from './commun.tsx'
import { Contenu } from './Contenu.tsx'

export interface Apercu { version: Version; contenu: unknown | null }

function nomVersion(v: Version): string {
  if (v.nom) return v.nom
  if (v.type === 'auto') return 'Automatique'
  if (v.type === 'restauration') return 'Restauration'
  return ''
}
function auteurs(v: Version): string {
  if (Array.isArray(v.auteurs)) return v.auteurs.join(', ')
  return v.auteurs ?? v.auteur ?? ''
}
function prochainNumero(versions: Version[]): string {
  const max = versions.reduce((m, v) => Math.max(m, parseInt((v.numero ?? 'v0').replace(/^v/, ''), 10) || 0), 0)
  return `v${max + 1}`
}

// Colonne de gauche de E-03 (ou panneau E-05 sur téléphone).
export default function Historique({ versions, apercu, estProprietaire, lectureSeule, nbConnectes, message, compact, onChoisir, onCreer, onRestaurer, onFermer }: {
  versions: Version[]
  apercu: Apercu | null
  estProprietaire: boolean
  lectureSeule: boolean
  nbConnectes: number
  message: { type: 'ok' | 'erreur'; texte: string } | null
  compact: boolean
  onChoisir: (v: Version | null) => void
  onCreer: (nom: string) => void
  onRestaurer: (versionId: string) => void
  onFermer?: () => void
}) {
  const [nom, setNom] = useState('')
  const [confirmer, setConfirmer] = useState(false)

  function creer(e: FormEvent) {
    e.preventDefault()
    onCreer(nom.trim())
    setNom('')
  }

  const choisie = apercu?.version
  const libelleChoix = choisie ? `${choisie.numero ?? ''}${nomVersion(choisie) ? ` — ${nomVersion(choisie)}` : ''}`.trim() : ''
  const en = (v: Version) => v.horodatage ?? v.creeLe

  const contenuListe = (
    <>
      {!lectureSeule ? (
        <form className="champ" onSubmit={creer}>
          <label htmlFor="nom-version">Créer une version</label>
          <div className="champ__ligne">
            <input id="nom-version" placeholder="Ex. : avant relecture finale" aria-describedby="num-aide" value={nom} onChange={(e) => setNom(e.target.value)} />
            <button className="bouton bouton--secondaire bouton--petit" type="submit"><Icone nom="plus" />Créer</button>
          </div>
          <span className="champ__aide" id="num-aide">Elle sera numérotée <strong>{prochainNumero(versions)}</strong>. Ce numéro figure sur les PDF.</span>
        </form>
      ) : (
        <p className="champ__erreur"><Icone nom="cadenas" /> Création de version impossible pendant le blocage.</p>
      )}
      {message && (
        <Bandeau type={message.type === 'ok' ? 'succes' : 'erreur'} icone={message.type === 'ok' ? 'check' : 'alerte'} role={message.type === 'ok' ? 'status' : 'alert'} titre={message.texte} />
      )}
      <ul className="liste-docs" aria-label="Versions du document">
        <li>
          <button className="version" type="button" aria-current={!apercu} onClick={() => { setConfirmer(false); onChoisir(null) }}>
            <span className="version__ligne version__ligne--actuelle"><span className="version__num">en cours</span><span className="version__nom">Version actuelle</span></span>
            <span className="petit doux">{nbConnectes} connecté{nbConnectes > 1 ? 's' : ''}</span>
          </button>
        </li>
        {versions.map((v) => (
          <li key={v.versionId}>
            <button className="version" type="button" aria-current={choisie?.versionId === v.versionId} onClick={() => { setConfirmer(false); onChoisir(v) }}>
              <span className="version__ligne"><span className="version__num">{v.numero ?? '—'}</span><span className="version__nom">{nomVersion(v)}</span></span>
              <span className="petit doux">{en(v) ? dateHeure(en(v)!) : ''}{auteurs(v) ? ` · ${auteurs(v)}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
      {versions.length === 0 && <p className="petit doux" style={{ margin: 0 }}>Aucune version pour l'instant.</p>}

      {compact && choisie && (
        <section className="pile--s" aria-label="Aperçu de la version">
          <div className="ligne ligne--entre"><strong>Aperçu · {libelleChoix}</strong><span className="etat etat--info"><Icone nom="oeil" />Lecture seule</span></div>
          <div className="apercu">{apercu.contenu === null ? <p className="doux">Chargement…</p> : <Contenu contenu={apercu.contenu} />}</div>
        </section>
      )}

      {choisie && estProprietaire && !confirmer && (
        <div className="pile--s">
          <button className="bouton bouton--danger bouton--plein" type="button" onClick={() => setConfirmer(true)}><Icone nom="restaurer" />Restaurer {choisie.numero}</button>
          <span className="tres-petit doux">Le texte redevient celui de {choisie.numero} pour tous les connectés. Rien n'est perdu : la version actuelle reste dans l'historique. Aucun crédit consommé.</span>
        </div>
      )}
      {choisie && !estProprietaire && (
        <Bandeau icone="info" titre="Seuls les propriétaires restaurent">Demandez à un propriétaire du document.</Bandeau>
      )}
      {choisie && estProprietaire && confirmer && (
        <div className="bandeau bandeau--attente" role="alertdialog" aria-labelledby="conf-titre">
          <Icone nom="alerte" />
          <div className="bandeau__corps">
            <strong id="conf-titre">Restaurer {choisie.numero} pour tout le monde ?</strong>
            <span>Les {nbConnectes} personnes connectées verront le texte changer tout de suite. Une nouvelle version « Restauration de {choisie.numero} » sera créée.</span>
            <div className="ligne" style={{ marginTop: 'var(--e-2)' }}>
              <button className="bouton bouton--principal bouton--petit" type="button" onClick={() => { setConfirmer(false); onRestaurer(choisie.versionId) }}>Oui, restaurer</button>
              <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => setConfirmer(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  if (compact) {
    return (
      <div className="scene__voile scene__voile--droite scene__voile--fixe">
        <aside className="panneau-droit" aria-labelledby="titre-histo">
          <div className="fenetre__tete">
            <h2 id="titre-histo" style={{ margin: 0, fontSize: 'var(--t-xl)' }}>Historique</h2>
            <button className="bouton bouton--discret bouton--petit" type="button" aria-label="Fermer" onClick={onFermer}><Icone nom="fermer" /></button>
          </div>
          {contenuListe}
        </aside>
      </div>
    )
  }
  return (
    <aside className="versions" aria-labelledby="titre-versions">
      <h2 id="titre-versions"><Icone nom="historique" /> Versions</h2>
      {contenuListe}
    </aside>
  )
}

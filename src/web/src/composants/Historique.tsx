import { useMemo, useState, type FormEvent } from 'react'
import type { FormatVersion, Membre, Version } from '../api.ts'
import { chiffresVersion, comparerChiffres, dateHeure, incrementerChiffres, nomCourt, profondeurFormat, texteVersion } from '../format.ts'
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

const NOMS_CHIFFRE = ['Premier', 'Deuxième', 'Troisième']

// Colonne de gauche de E-03 (ou panneau E-05 sur téléphone).
export default function Historique({ versions, format, dernierNumero, membres, apercu, estProprietaire, lectureSeule, nbConnectes, message, compact, onChoisir, onCreer, onRestaurer, onFermer }: {
  versions: Version[]
  format: FormatVersion | undefined
  dernierNumero: string | undefined
  membres: Membre[]
  apercu: Apercu | null
  estProprietaire: boolean
  lectureSeule: boolean
  nbConnectes: number
  message: { type: 'ok' | 'erreur'; texte: string } | null
  compact: boolean
  onChoisir: (v: Version | null) => void
  onCreer: (nom: string, niveau: number) => void
  onRestaurer: (versionId: string) => void
  onFermer?: () => void
}) {
  const [nom, setNom] = useState('')
  const [niveauChoisi, setNiveauChoisi] = useState<number | null>(null)
  const [confirmer, setConfirmer] = useState(false)

  const profondeur = profondeurFormat(format)
  const niveau = niveauChoisi ?? profondeur // par défaut : le dernier chiffre

  // Dernier numéro connu : le plus grand de la liste, sinon celui du document.
  const dernier = useMemo(() => {
    let max: number[] | null = chiffresVersion(dernierNumero)
    for (const v of versions) {
      const c = chiffresVersion(v.numero)
      if (c && (!max || comparerChiffres(c, max) > 0)) max = c
    }
    return max
  }, [versions, dernierNumero])

  const base = dernier ? Array.from({ length: profondeur }, (_, i) => dernier[i] ?? 0) : null
  const apres = (k: number) => (base ? texteVersion(incrementerChiffres(base, k)) : null)
  const options = Array.from({ length: profondeur }, (_, i) => i + 1).map((k) => {
    const lib = k === profondeur ? 'Dernier chiffre' : `${NOMS_CHIFFRE[k - 1]} chiffre`
    return { k, texte: base ? `${lib} : ${texteVersion(base)} → ${apres(k)}` : lib }
  })
  const prochain = apres(niveau)
  const prochainRestauration = apres(profondeur) // une restauration augmente toujours le dernier chiffre

  function creer(e: FormEvent) {
    e.preventDefault()
    onCreer(nom.trim(), niveau)
    setNom('')
    setNiveauChoisi(null)
  }

  const choisie = apercu?.version
  const libelleChoix = choisie ? `${choisie.numero ?? ''}${nomVersion(choisie) ? ` — ${nomVersion(choisie)}` : ''}`.trim() : ''
  const en = (v: Version) => v.horodatage ?? v.creeLe
  const proprietaires = membres.filter((m) => m.role !== 'membre').map((m) => nomCourt(m.nom)).join(' ou ')

  const contenuListe = (
    <>
      {!lectureSeule ? (
        <form className="champ" onSubmit={creer}>
          <label htmlFor="nom-version">Créer une version</label>
          <div className="champ__ligne">
            <input id="nom-version" placeholder="Nom (optionnel)" aria-describedby="num-aide" value={nom} onChange={(e) => setNom(e.target.value)} />
            <button className="bouton bouton--sombre bouton--petit" type="submit"><Icone nom="plus" />Créer</button>
          </div>
          {profondeur > 1 && (
            <div className="niveau-version">
              <label htmlFor="niveau">Incrémenter</label>
              <select id="niveau" aria-describedby="num-aide" value={niveau} onChange={(e) => setNiveauChoisi(Number(e.target.value))}>
                {options.map((o) => <option key={o.k} value={o.k}>{o.texte}</option>)}
              </select>
            </div>
          )}
          <span className="champ__aide" id="num-aide">{prochain ? <>Sera numérotée <strong>{prochain}</strong>. </> : null}Ce numéro figure sur les PDF.</span>
        </form>
      ) : (
        <p className="champ__erreur"><Icone nom="cadenas" /> Création de version impossible pendant le blocage.</p>
      )}
      {message && (
        <Bandeau type={message.type === 'ok' ? 'succes' : 'erreur'} icone={message.type === 'ok' ? 'check' : 'alerte'} role={message.type === 'ok' ? 'status' : 'alert'} titre={message.texte} />
      )}
      <ul className="chronologie" aria-label="Versions du document">
        <li className="en-cours">
          <button className="version" type="button" aria-current={!apercu} onClick={() => { setConfirmer(false); onChoisir(null) }}>
            <span className="version__ligne"><span className="version__num version__num--vivant">en cours</span><span className="version__nom">Version actuelle</span></span>
            <span className="tres-petit doux">{nbConnectes} connecté{nbConnectes > 1 ? 's' : ''}</span>
          </button>
        </li>
        {versions.map((v) => (
          <li key={v.versionId}>
            <button className="version" type="button" aria-current={choisie?.versionId === v.versionId} onClick={() => { setConfirmer(false); onChoisir(v) }}>
              <span className="version__ligne"><span className={`version__num${v.type === 'auto' ? ' version__num--auto' : ''}`}>{v.numero ?? '—'}</span><span className="version__nom">{nomVersion(v)}</span></span>
              <span className="tres-petit doux">{en(v) ? dateHeure(en(v)!) : ''}{auteurs(v) ? ` · ${auteurs(v)}` : ''}</span>
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
        <Bandeau icone="info" titre="Seuls les propriétaires restaurent">{proprietaires ? `Demandez à ${proprietaires}.` : 'Demandez à un propriétaire du document.'}</Bandeau>
      )}
      {choisie && estProprietaire && confirmer && (
        <div className="bandeau bandeau--avert" role="alertdialog" aria-labelledby="conf-titre">
          <Icone nom="alerte" />
          <div className="bandeau__corps">
            <strong id="conf-titre">Restaurer {choisie.numero} pour tout le monde ?</strong>
            <span>Les {nbConnectes} personnes connectées verront le texte changer tout de suite. {prochainRestauration ? `Une version ${prochainRestauration} ` : 'Une nouvelle version '}« Restauration de {choisie.numero} » sera créée.</span>
            <div className="ligne" style={{ marginTop: 'var(--e-2)' }}>
              <button className="bouton bouton--sombre bouton--petit" type="button" onClick={() => { setConfirmer(false); onRestaurer(choisie.versionId) }}>Oui, restaurer</button>
              <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => setConfirmer(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  const chip = format ? <span className="format-chip" title="Format choisi à la création du document, non modifiable">{format}</span> : null

  if (compact) {
    return (
      <div className="scene__voile scene__voile--droite voile-fixe">
        <aside className="panneau-droit" aria-labelledby="titre-histo">
          <div className="fenetre__tete">
            <h2 id="titre-histo">Versions {chip}</h2>
            <button className="bouton-rond" type="button" aria-label="Fermer" onClick={onFermer}><Icone nom="fermer" /></button>
          </div>
          {contenuListe}
        </aside>
      </div>
    )
  }
  return (
    <aside className="versions" aria-labelledby="titre-versions">
      <h2 id="titre-versions"><Icone nom="historique" /> Versions {chip}</h2>
      {contenuListe}
    </aside>
  )
}

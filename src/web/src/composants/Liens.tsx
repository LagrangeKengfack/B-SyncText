import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ErreurApi, urlAbsolue, type LienResume } from '../api.ts'
import { copier, nombre } from '../format.ts'
import { Barre, Bandeau, Fenetre, Icone } from './commun.tsx'

// E-06 : liens de téléchargement du document.
export default function Liens({ docId, titreDoc, onFermer }: { docId: string; titreDoc: string; onFermer: () => void }) {
  const [liens, setLiens] = useState<LienResume[]>([])
  const [n, setN] = useState('500')
  const [nouveau, setNouveau] = useState<{ lienId: string; url: string; n: number } | null>(null)
  const [erreur, setErreur] = useState('')
  const [copie, setCopie] = useState('')

  const charger = useCallback(() => {
    api.liens(docId).then(setLiens).catch((e) => setErreur(e instanceof ErreurApi ? e.message : 'Chargement impossible.'))
  }, [docId])
  useEffect(charger, [charger])

  const valeur = Number(n)
  const nValide = Number.isInteger(valeur) && valeur >= 1 && valeur <= 10000

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!nValide) return
    setErreur('')
    try {
      setNouveau(await api.creerLien(docId, valeur))
      charger()
    } catch (e2) { setErreur(e2 instanceof ErreurApi ? e2.message : 'Création impossible.') }
  }

  async function copierLien(lienId: string, chemin?: string) {
    if (await copier(urlAbsolue(chemin ?? `/l/${lienId}`))) { setCopie(lienId); setTimeout(() => setCopie(''), 2000) }
  }

  const adresse = nouveau ? urlAbsolue(nouveau.url) : ''
  return (
    <Fenetre titreId="titre-liens" titre="Liens de téléchargement" onFermer={onFermer}>
      <p className="doux petit" style={{ marginTop: 'calc(var(--e-3) * -1)' }}>{titreDoc}. Un lien donne toujours le document tel qu'il est au moment du téléchargement.</p>
      {!nouveau && (
        <form className="pile" onSubmit={creer} noValidate>
          <div className="champ">
            <label htmlFor="n">Nombre de téléchargements autorisés</label>
            <div className="champ__ligne">
              <input id="n" name="n" type="number" min={1} max={10000} value={n} onChange={(e) => setN(e.target.value)} inputMode="numeric" aria-describedby="n-aide" aria-invalid={!nValide || undefined} />
              <button className="bouton bouton--principal" type="submit" disabled={!nValide}>Créer le lien</button>
            </div>
            <span className="champ__aide" id="n-aide">Entre 1 et 10 000. Une fois ce nombre atteint, le lien cesse de fonctionner.</span>
          </div>
        </form>
      )}
      {nouveau && (
        <div className="pile">
          <Bandeau type="succes" icone="check" role="status" titre={`Lien créé : ${nombre(nouveau.n)} téléchargements`}>
            Partagez cette adresse. Vous serez prévenu par e-mail au dernier téléchargement.
          </Bandeau>
          <div className="champ">
            <label htmlFor="adresse">Adresse à copier</label>
            <div className="adresse">
              <span className="code" id="adresse">{adresse}</span>
              <button className="bouton bouton--principal bouton--petit" type="button" onClick={() => copierLien(nouveau.lienId, nouveau.url)}>
                <Icone nom="copier" />{copie === nouveau.lienId ? 'Copié' : 'Copier'}
              </button>
            </div>
          </div>
          <div><button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => setNouveau(null)}><Icone nom="plus" />Créer un autre lien</button></div>
        </div>
      )}
      {erreur && <p className="champ__erreur" role="alert">{erreur}</p>}
      <h3>Liens de ce document</h3>
      {liens.length === 0 && <p className="doux petit">Aucun lien pour l'instant.</p>}
      <ul className="liste-docs" style={{ gap: 'var(--e-3)' }}>
        {liens.map((l) => {
          const epuise = l.etat === 'epuise' || l.restants <= 0
          const presque = !epuise && l.restants <= Math.max(1, l.n * 0.1)
          const p = l.n > 0 ? (l.restants / l.n) * 100 : 0
          return (
            <li className="lien-ligne" key={l.lienId}>
              <div className="lien-ligne__tete">
                <span className="code">…/l/{l.lienId}</span>
                <span className="ligne" style={{ gap: 'var(--e-2)' }}>
                  {nouveau?.lienId === l.lienId && <span className="etat etat--succes"><Icone nom="check" />Nouveau</span>}
                  {epuise ? <span className="etat etat--epuise"><Icone nom="interdit" />Épuisé</span>
                    : presque ? <span className="etat etat--avert"><Icone nom="alerte" />Presque épuisé</span>
                    : <span className="etat etat--info">Actif</span>}
                  {l.email === 'envoye' && <span className="etat etat--succes"><Icone nom="mail" />E-mail envoyé</span>}
                  {l.email === 'echec' && <span className="etat etat--avert" title={l.emailErreur ?? undefined}><Icone nom="alerte" />E-mail non envoyé</span>}
                </span>
              </div>
              <div className="ligne ligne--entre">
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{nombre(l.restants)} / {nombre(l.n)} restants</strong>
                {!epuise && (
                  <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => copierLien(l.lienId, l.url)}>
                    <Icone nom="copier" />{copie === l.lienId ? 'Copié' : 'Copier'}
                  </button>
                )}
              </div>
              <Barre pourcent={p} rayee variante={presque ? 'attention' : undefined} libelle={`${Math.round(p)} % restant`} />
              {epuise && l.email === 'envoye' && <span className="tres-petit doux">Le créateur a été prévenu par e-mail.</span>}
              {epuise && l.email === 'echec' && <span className="tres-petit doux">Le créateur n'a pas pu être prévenu par e-mail{l.emailErreur ? ` (${l.emailErreur})` : ''}.</span>}
            </li>
          )
        })}
      </ul>
    </Fenetre>
  )
}

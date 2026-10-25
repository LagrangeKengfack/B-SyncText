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
      <p className="doux petit" style={{ margin: 'calc(var(--e-2) * -1) 0 0' }}>{titreDoc}. Un lien donne toujours le document tel qu'il est au moment du téléchargement.</p>
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
          <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => setNouveau(null)}><Icone nom="plus" />Créer un autre lien</button>
        </div>
      )}
      {erreur && <p className="champ__erreur" role="alert">{erreur}</p>}
      <hr className="separateur" style={{ margin: 0 }} />
      <h3 style={{ margin: 0 }}>Liens de ce document</h3>
      {liens.length === 0 && <p className="doux petit" style={{ margin: 0 }}>Aucun lien pour l'instant.</p>}
      <ul className="liste-docs" style={{ gap: 'var(--e-2)' }}>
        {liens.map((l) => {
          const epuise = l.etat === 'epuise' || l.restants <= 0
          const presque = !epuise && l.restants <= Math.max(1, l.n * 0.1)
          const p = l.n > 0 ? (l.restants / l.n) * 100 : 0
          return (
            <li className="doc" key={l.lienId}>
              <div className="pile--s">
                <div className="ligne">
                  <span className="code">…/l/{l.lienId.slice(-8)}</span>
                  {nouveau?.lienId === l.lienId && <span className="etat etat--succes"><Icone nom="check" />Nouveau</span>}
                  {epuise ? <span className="etat etat--epuise"><Icone nom="interdit" />Épuisé</span>
                    : presque ? <span className="etat etat--attente"><Icone nom="alerte" />Presque épuisé</span>
                    : <span className="etat etat--info">Actif</span>}
                </div>
                <div className="credit">
                  <div className="credit__texte"><span>Restants</span><strong>{nombre(l.restants)} / {nombre(l.n)}</strong></div>
                  <Barre pourcent={p} variante={presque ? 'attention' : undefined} libelle={`${Math.round(p)} % restant`} />
                </div>
              </div>
              {!epuise && (
                <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => copierLien(l.lienId)}>
                  <Icone nom="copier" />{copie === l.lienId ? 'Copié' : 'Copier'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Fenetre>
  )
}

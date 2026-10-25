import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { api, ErreurApi, type PersonneRef, type TableauDeBord } from '../api.ts'
import { Barre, Icone, Marque } from '../composants/commun.tsx'
import { heureWat, heureWatSecondes, initiales, nombre, nomCourt } from '../format.ts'

const CLE_CODE = 'bsynctext.admin'

function lireCode(): string {
  try { return sessionStorage.getItem(CLE_CODE) ?? '' } catch { return '' }
}
function ecrireCode(c: string) {
  try { if (c) sessionStorage.setItem(CLE_CODE, c); else sessionStorage.removeItem(CLE_CODE) } catch { /* ignoré */ }
}

function nomDe(p: PersonneRef | string | null | undefined): string {
  if (!p) return '—'
  return nomCourt(typeof p === 'string' ? p : p.nom)
}

// Jauge à segments : 14 traits en demi-cercle, les premiers allumés selon le pourcentage.
function Jauge({ pourcent }: { pourcent: number }) {
  const total = 14
  const allumes = Math.round((pourcent / 100) * total)
  const traits = Array.from({ length: total }, (_, i) => {
    const a = Math.PI - ((i + 0.5) * Math.PI) / total
    const x = (r: number) => (140 - r * Math.cos(Math.PI - a)).toFixed(1)
    const y = (r: number) => (140 - r * Math.sin(a)).toFixed(1)
    return <line key={i} x1={x(86)} y1={y(86)} x2={x(118)} y2={y(118)} strokeWidth="11" strokeLinecap="round"
      style={{ stroke: i < allumes ? 'var(--orange-500)' : 'var(--bordure)' }} />
  })
  return (
    <div className="jauge" style={{ marginTop: 'var(--e-4)' }}>
      <svg viewBox="0 0 280 150" role="img" aria-label={`${Math.round(pourcent)} % des exemplaires distribués`}>{traits}</svg>
      <div className="jauge__valeur"><strong>{Math.round(pourcent)} %</strong><span className="petit doux">distribués</span></div>
    </div>
  )
}

// E-08 puis E-09. Le code reste en sessionStorage (onglet) seulement.
export default function Association() {
  const [code, setCode] = useState(lireCode())
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState('')
  const [donnees, setDonnees] = useState<TableauDeBord | null>(null)
  const [maj, setMaj] = useState(0)

  async function ouvrir(e: FormEvent) {
    e.preventDefault()
    setErreur('')
    try {
      const d = await api.tableauDeBord(saisie)
      ecrireCode(saisie)
      setCode(saisie)
      setDonnees(d)
      setMaj(Date.now())
    } catch (e2) {
      setErreur(e2 instanceof ErreurApi && e2.statut === 429 ? 'trop' : 'faux')
    }
  }

  // Rafraîchissement toutes les 5 s.
  useEffect(() => {
    if (!code) return
    let actif = true
    const charger = () => api.tableauDeBord(code).then((d) => {
      if (actif) { setDonnees(d); setMaj(Date.now()) }
    }).catch((e) => {
      if (actif && e instanceof ErreurApi && (e.statut === 401 || e.statut === 403)) { ecrireCode(''); setCode(''); setDonnees(null); setErreur('faux') }
    })
    void charger()
    const t = setInterval(charger, 5000)
    return () => { actif = false; clearInterval(t) }
  }, [code])

  if (!code) {
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 'var(--e-6) var(--e-4)' }}>
        <div className="pile pile--l" style={{ width: 'min(440px, 100%)', justifyItems: 'center' }}>
          <Marque grande />
          <div className="modale" style={{ width: '100%' }}>
            <div className="modale__tete">
              <h2>Association</h2>
              <p>Suivez les documents ouverts, les liens actifs et les personnes bloquées.</p>
            </div>
            <div className="modale__corps">
              <h3>Code administrateur</h3>
              {erreur && (
                <div className="bandeau bandeau--erreur" role="alert">
                  <Icone nom="alerte" />
                  <div className="bandeau__corps"><strong>{erreur === 'trop' ? "Trop d'essais" : 'Code incorrect'}</strong>
                    <span>{erreur === 'trop' ? "L'accès est suspendu quelques minutes. Réessayez plus tard." : "Vérifiez le code et réessayez. Après plusieurs essais ratés, l'accès est suspendu quelques minutes."}</span></div>
                </div>
              )}
              <form className="pile" onSubmit={ouvrir}>
                <div className={`champ champ--pilule${erreur === 'faux' ? ' champ--erreur' : ''}`}>
                  <label className="sr-seulement" htmlFor="code">Code administrateur</label>
                  <div className="champ__avec-icone"><Icone nom="cadenas" />
                    <input id="code" type="password" autoComplete="off" autoFocus placeholder="Code administrateur" value={saisie}
                      onChange={(e) => setSaisie(e.target.value)} aria-invalid={erreur === 'faux' || undefined} /></div>
                </div>
                <button className="bouton bouton--principal bouton--plein bouton--grand" type="submit" disabled={!saisie}>Accéder au tableau de bord</button>
              </form>
              <p className="tres-petit doux centre">Le tableau de bord est en lecture seule.</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const docs = donnees?.documentsOuverts ?? []
  const liens = donnees?.liensActifs ?? []
  const bloques = donnees?.bloques ?? []
  const connectes = docs.reduce((s, d) => s + (d.connectes || 0), 0)
  const restantsDe = (l: TableauDeBord['liensActifs'][number]) => l.restants ?? l.disponibles ?? 0
  // Lien « en cours de parution » : le plus avancé parmi ceux qui ne sont pas épuisés.
  const enCours = liens.filter((l) => restantsDe(l) > 0 && l.n > 0)
    .sort((a, b) => (b.n - restantsDe(b)) / b.n - (a.n - restantsDe(a)) / a.n)[0]
  const pluriel = (n: number, mot: string) => `${mot}${n > 1 ? 's' : ''}`

  return (
    <>
      <header className="barre-app">
        <div className="barre-app__contenu">
          <Marque vers="/association" />
          <span className="espace"></span>
          <nav className="nav-pilules" aria-label="Sections du tableau de bord">
            <a href="#t-liens" aria-current="page">Vue d'ensemble</a><a href="#t-docs">Documents ouverts</a><a href="#t-liens">Liens actifs</a><a href="#t-bloques">Blocages</a>
          </nav>
          <span className="espace"></span>
          <span className="pilule-compte"><span className="avatar avatar--s" style={{ '--c': 'var(--encre)' } as CSSProperties} aria-hidden="true">AS</span>Association</span>
          <button className="bouton-rond" type="button" aria-label="Quitter" title="Quitter" onClick={() => { ecrireCode(''); setCode(''); setSaisie(''); setDonnees(null) }}><Icone nom="quitter" /></button>
        </div>
      </header>
      <main className="conteneur pile pile--l" style={{ paddingTop: 'var(--e-4)', paddingBottom: 'var(--e-9)' }}>
        <div className="ligne ligne--entre ligne--haut">
          <div className="salutation"><h1 className="titre-page">Bonjour, l'équipe.</h1><p className="doux">Voici l'état de vos documents et de vos liens, en direct.</p></div>
          <span className="etat etat--succes" role="status"><Icone nom="actualiser" />Mis à jour à {maj ? heureWatSecondes(maj) : '…'} · toutes les 5 s</span>
        </div>
        <div className="tuiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          <div className="tuile tuile--ligne"><span className="tuile__icone"><Icone nom="documents" /></span><span className="tuile__valeur">{docs.length}</span><span className="tuile__nom">{pluriel(docs.length, 'document')} {pluriel(docs.length, 'ouvert')}</span></div>
          <div className="tuile tuile--ligne"><span className="tuile__icone"><Icone nom="personnes" /></span><span className="tuile__valeur">{nombre(connectes)}</span><span className="tuile__nom">{pluriel(connectes, 'rédacteur')} {pluriel(connectes, 'connecté')}</span></div>
          <div className="tuile tuile--ligne"><span className="tuile__icone"><Icone nom="lien" /></span><span className="tuile__valeur">{liens.length}</span><span className="tuile__nom">{pluriel(liens.length, 'lien')} {pluriel(liens.length, 'actif')}</span></div>
          <div className="tuile tuile--ligne"><span className="tuile__icone"><Icone nom="interdit" /></span><span className="tuile__valeur">{bloques.length}</span><span className="tuile__nom">{pluriel(bloques.length, 'personne')} {pluriel(bloques.length, 'bloquée')}</span></div>
        </div>

        <div className="tdb">
          <div className="tdb__col">
            <section className="carte" aria-labelledby="t-liens">
              <h2 id="t-liens"><Icone nom="lien" /> Liens actifs</h2>
              <p className="tdb__sous">Exemplaires distribués sur le nombre autorisé</p>
              {liens.length === 0 ? <p className="etat-vide">Aucun lien de téléchargement actif.</p> : (
                <ul className="liste-docs" style={{ gap: 0, marginTop: 'var(--e-3)' }}>
                  {liens.map((l, i) => {
                    const restants = restantsDe(l)
                    const distribues = Math.max(0, l.n - restants)
                    const p = l.n > 0 ? (distribues / l.n) * 100 : 0
                    const presque = restants > 0 && restants / l.n <= 0.1
                    return (
                      <li className="rangee" key={l.lienId ?? i}>
                        <div className="rangee__titre"><Icone nom="documents" /><span>{l.titre}</span></div>
                        <div className="rangee__chiffre">{nombre(distribues)} <small>/ {nombre(l.n)}</small></div>
                        <div className="rangee__meta">
                          <Barre pourcent={p} rayee={!presque} variante={presque ? 'attention' : undefined} grosse libelle={`${Math.round(p)} % distribués`} />
                          <span className="tres-petit doux">
                            {presque && <><span className="etat etat--avert"><Icone nom="alerte" />Presque épuisé</span>{' '}</>}
                            Créé par {l.creeParNom ? nomCourt(l.creeParNom) : l.creePar ?? '—'} · {nombre(restants)} {restants > 1 ? 'exemplaires restants' : 'exemplaire restant'}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
            <section className="carte" aria-labelledby="t-docs">
              <h2 id="t-docs"><Icone nom="documents" /> Documents ouverts</h2>
              <p className="tdb__sous">Documents où au moins un rédacteur est connecté</p>
              {docs.length === 0 ? <p className="etat-vide">Aucun document n'est ouvert en ce moment.</p> : (
                <ul className="liste-docs" style={{ gap: 0, marginTop: 'var(--e-3)' }}>
                  {docs.map((d, i) => (
                    <li className="rangee" key={d.docId ?? i}>
                      <div className="rangee__titre"><Icone nom="documents" /><span>{d.titre}</span></div>
                      <div className="rangee__chiffre">{nombre(d.connectes)} <small>{d.connectes > 1 ? 'connectés' : 'connecté'}</small></div>
                      <div className="rangee__meta"><span className="tres-petit doux">Propriétaire principal : {nomDe(d.principal)}</span></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="tdb__col">
            {enCours && (
              <section className="carte" aria-labelledby="t-jauge">
                <h2 id="t-jauge">Lien en cours de parution</h2>
                <p className="tdb__sous">{enCours.titre}</p>
                <Jauge pourcent={((enCours.n - restantsDe(enCours)) / enCours.n) * 100} />
                <div className="ligne ligne--entre" style={{ marginTop: 'var(--e-5)', textAlign: 'center' }}>
                  <div><div className="gras" style={{ fontSize: 'var(--t-xl)' }}>{nombre(enCours.n - restantsDe(enCours))}</div><div className="tres-petit doux">téléchargés</div></div>
                  <div><div className="gras" style={{ fontSize: 'var(--t-xl)' }}>{nombre(restantsDe(enCours))}</div><div className="tres-petit doux">restants</div></div>
                  <div><div className="gras" style={{ fontSize: 'var(--t-xl)' }}>{nombre(enCours.n)}</div><div className="tres-petit doux">autorisés</div></div>
                </div>
              </section>
            )}
            <section className="carte" aria-labelledby="t-bloques">
              <h2 id="t-bloques"><Icone nom="interdit" /> Personnes bloquées</h2>
              <p className="tdb__sous">Le blocage se lève tout seul à l'heure indiquée</p>
              {bloques.length === 0 ? <p className="etat-vide">Personne n'est bloqué.</p> : (
                <ul className="liste-docs" style={{ gap: 0, marginTop: 'var(--e-3)' }}>
                  {bloques.map((b) => {
                    const min = Math.max(0, Math.round((b.bloqueJusqua - Date.now()) / 60000))
                    const nom = b.nom ?? b.email
                    return (
                      <li className="rangee" key={b.email}>
                        <div className="rangee__titre">
                          <span className="avatar avatar--l" style={{ '--c': 'var(--presence-5)' } as CSSProperties} aria-hidden="true">{initiales(nom)}</span>
                          <span>{b.nom ? nomCourt(b.nom) : b.email}<br /><span className="code doux tres-petit">{b.email}</span></span>
                        </div>
                        <div className="rangee__chiffre"><span className="etat etat--info"><Icone nom="horloge" />{heureWat(b.bloqueJusqua)}</span></div>
                        <div className="rangee__meta"><span className="tres-petit doux">{b.motif ? `${b.motif} · ` : ''}fin dans {min} min</span></div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  )
}

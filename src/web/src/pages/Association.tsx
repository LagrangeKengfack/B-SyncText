import { useEffect, useState, type FormEvent } from 'react'
import { api, ErreurApi, type TableauDeBord } from '../api.ts'
import { Barre, Icone } from '../composants/commun.tsx'
import { heureWat, heureWatSecondes, nombre, nomCourt } from '../format.ts'

const CLE_CODE = 'bsynctext.admin'

function lireCode(): string {
  try { return sessionStorage.getItem(CLE_CODE) ?? '' } catch { return '' }
}
function ecrireCode(c: string) {
  try { if (c) sessionStorage.setItem(CLE_CODE, c); else sessionStorage.removeItem(CLE_CODE) } catch { /* ignoré */ }
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
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, var(--violet-200) 0%, var(--violet-50) 45%, var(--accent-doux) 100%) fixed' }}>
        <main className="conteneur conteneur--etroit page-centree">
          <div className="pile pile--l">
            <div className="centre" style={{ display: 'grid', justifyItems: 'center' }}><span className="marque marque--grande"><img src="/logo-clair.svg" alt="" />B-SyncText</span></div>
            <div className="carte pile">
              <h1 style={{ margin: 0, fontSize: 'var(--t-xl)' }}><Icone nom="cadenas" /> Accès association</h1>
              <p className="doux" style={{ margin: 0 }}>Réservé à l'équipe de l'association : saisissez le code administrateur pour voir le tableau de bord.</p>
              {erreur && (
                <div className="bandeau bandeau--erreur" role="alert">
                  <Icone nom="alerte" />
                  <div className="bandeau__corps"><strong>{erreur === 'trop' ? 'Trop d\'essais' : 'Code incorrect'}</strong>
                    <span>{erreur === 'trop' ? 'L\'accès est suspendu quelques minutes. Réessayez plus tard.' : 'Vérifiez le code et réessayez. Après plusieurs essais ratés, l\'accès est suspendu quelques minutes.'}</span></div>
                </div>
              )}
              <form className="pile" onSubmit={ouvrir}>
                <div className={`champ${erreur === 'faux' ? ' champ--erreur' : ''}`}>
                  <label htmlFor="code">Code administrateur</label>
                  <input id="code" type="password" autoComplete="off" autoFocus value={saisie} onChange={(e) => setSaisie(e.target.value)} aria-invalid={erreur === 'faux' || undefined} />
                </div>
                <button className="bouton bouton--principal bouton--plein" type="submit" disabled={!saisie}>Accéder au tableau de bord</button>
              </form>
              <p className="tres-petit doux centre" style={{ margin: 0 }}>Le tableau de bord est en lecture seule.</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const docs = donnees?.documentsOuverts ?? []
  const liens = donnees?.liensActifs ?? []
  const bloques = donnees?.bloques ?? []
  return (
    <>
      <header className="entete-app">
        <div className="entete-app__contenu">
          <span className="marque"><img src="/favicon.svg" alt="" />B-SyncText</span>
          <span className="role role--principal">Association</span>
          <span className="espace"></span>
          <span className="statut" role="status"><Icone nom="actualiser" />Mis à jour à {maj ? heureWatSecondes(maj) : '…'} · toutes les 5 s</span>
          <button className="bouton bouton--discret bouton--petit" type="button" onClick={() => { ecrireCode(''); setCode(''); setSaisie(''); setDonnees(null) }}><Icone nom="quitter" />Quitter</button>
        </div>
      </header>
      <main className="conteneur" style={{ paddingTop: 'var(--e-6)', paddingBottom: 'var(--e-7)' }}>
        <div className="pile pile--l">
          <h1 style={{ margin: 0 }}>Tableau de bord</h1>
          <div className="tuiles">
            <div className="tuile"><span className="tuile__valeur">{docs.length}</span><span className="tuile__nom">document{docs.length > 1 ? 's' : ''} ouvert{docs.length > 1 ? 's' : ''}</span></div>
            <div className="tuile"><span className="tuile__valeur">{liens.length}</span><span className="tuile__nom">lien{liens.length > 1 ? 's' : ''} actif{liens.length > 1 ? 's' : ''}</span></div>
            <div className="tuile"><span className="tuile__valeur">{bloques.length}</span><span className="tuile__nom">personne{bloques.length > 1 ? 's' : ''} bloquée{bloques.length > 1 ? 's' : ''}</span></div>
          </div>

          <section className="carte pile" aria-labelledby="t-docs">
            <h2 id="t-docs" style={{ margin: 0, fontSize: 'var(--t-lg)' }}><Icone nom="document" /> Documents ouverts</h2>
            {docs.length === 0 ? <p className="doux" style={{ margin: 0 }}>Aucun document n'est ouvert en ce moment.</p> : (
              <div className="cadre-defilant">
                <table className="tableau tableau--cartes">
                  <thead><tr><th>Document</th><th>Propriétaire principal</th><th className="num">Personnes connectées</th></tr></thead>
                  <tbody>
                    {docs.map((d, i) => (
                      <tr key={d.docId ?? i}><td data-nom="Document">{d.titre}</td>
                        <td data-nom="Propriétaire">{d.principal ? nomCourt(typeof d.principal === 'string' ? d.principal : d.principal.nom) : '—'}</td>
                        <td className="num" data-nom="Connectées">{nombre(d.connectes)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="carte pile" aria-labelledby="t-liens">
            <h2 id="t-liens" style={{ margin: 0, fontSize: 'var(--t-lg)' }}><Icone nom="lien" /> Liens actifs</h2>
            {liens.length === 0 ? <p className="doux" style={{ margin: 0 }}>Aucun lien de téléchargement actif.</p> : (
              <div className="cadre-defilant">
                <table className="tableau tableau--cartes">
                  <thead><tr><th>Document</th><th>Créé par</th><th className="num">Exemplaires</th><th className="num">Restants</th><th style={{ minWidth: 160 }}>Reste à distribuer</th></tr></thead>
                  <tbody>
                    {liens.map((l, i) => {
                      const restants = l.restants ?? l.disponibles ?? 0
                      const p = l.n > 0 ? (restants / l.n) * 100 : 0
                      const presque = restants > 0 && p <= 10
                      return (
                        <tr key={l.lienId ?? i}><td data-nom="Document">{l.titre}</td><td data-nom="Créé par">{l.creeParNom ? nomCourt(l.creeParNom) : l.creePar ?? '—'}</td>
                          <td className="num" data-nom="Exemplaires">{nombre(l.n)}</td>
                          <td className="num" data-nom="Restants"><strong>{nombre(restants)}</strong> / {nombre(l.n)}
                            {presque && <span className="etat etat--attente" style={{ marginLeft: 'var(--e-2)' }}><Icone nom="alerte" />Presque épuisé</span>}</td>
                          <td data-nom="Reste"><div style={{ width: '100%' }}><Barre pourcent={p} variante={presque ? 'attention' : undefined} libelle={`${Math.round(p)} % restant`} /></div></td></tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="carte pile" aria-labelledby="t-bloques">
            <h2 id="t-bloques" style={{ margin: 0, fontSize: 'var(--t-lg)' }}><Icone nom="interdit" /> Personnes bloquées</h2>
            {bloques.length === 0 ? <p className="doux" style={{ margin: 0 }}>Personne n'est bloqué.</p> : (
              <div className="cadre-defilant">
                <table className="tableau tableau--cartes">
                  <thead><tr><th>Nom</th><th>E-mail</th><th>Motif</th><th>Fin du blocage</th></tr></thead>
                  <tbody>
                    {bloques.map((b) => {
                      const min = Math.max(0, Math.round((b.bloqueJusqua - Date.now()) / 60000))
                      return (
                        <tr key={b.email}><td data-nom="Nom">{b.nom ? nomCourt(b.nom) : '—'}</td><td data-nom="E-mail" className="code">{b.email}</td>
                          <td data-nom="Motif">{b.motif ?? '—'}</td>
                          <td data-nom="Fin"><span className="etat etat--info"><Icone nom="horloge" />{heureWat(b.bloqueJusqua)} · dans {min} min</span></td></tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="tres-petit doux" style={{ margin: 0 }}>Lecture seule : le blocage se lève tout seul à l'heure indiquée.</p>
          </section>
        </div>
      </main>
    </>
  )
}

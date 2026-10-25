import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { heureWat, initiales, nombre, nomCourt, texteRecharge, couleurPour, CREDIT_JOURNALIER } from '../format.ts'
import { useSession } from '../session.tsx'
import type { Credit } from '../api.ts'

export function Icone({ nom }: { nom: string }) {
  return <i className={`ico ico-${nom}`} aria-hidden="true"></i>
}

export function Avatar({ nom, couleur }: { nom: string; couleur: string }) {
  return (
    <span className="avatar" style={{ '--c': couleur } as React.CSSProperties}>{initiales(nom)}</span>
  )
}

export function Pastille({ nom, email, suffixe = '' }: { nom: string; email: string; suffixe?: string }) {
  const c = couleurPour(email)
  return (
    <span className="pastille" style={{ '--c': c } as React.CSSProperties}>
      <Avatar nom={nom} couleur={c} />{nomCourt(nom)}{suffixe}
    </span>
  )
}

export function Barre({ pourcent, variante, libelle }: { pourcent: number; variante?: 'danger' | 'attention'; libelle: string }) {
  const p = Math.max(0, Math.min(100, pourcent))
  return (
    <div className={`barre${variante ? ` barre--${variante}` : ''}`} role="img" aria-label={libelle}>
      <div className="barre__plein" style={{ '--p': `${p}%` } as React.CSSProperties}></div>
    </div>
  )
}

export function JaugeCredit({ credit, avecUnite = false }: { credit: Credit; avecUnite?: boolean }) {
  const p = (credit.restant / CREDIT_JOURNALIER) * 100
  const variante = credit.restant < 500 ? 'danger' : undefined
  return (
    <div className="credit">
      <div className="credit__texte">
        <span>Crédit du jour</span>
        <strong>{nombre(credit.restant)} / {nombre(CREDIT_JOURNALIER)}{avecUnite ? ' caractères' : ''}</strong>
      </div>
      <Barre pourcent={p} variante={variante} libelle={`${Math.round(p)} % du crédit restant`} />
    </div>
  )
}

export function Bandeau({ type, icone, titre, children, role, pleine }: {
  type?: 'succes' | 'attente' | 'erreur' | 'epuise'
  icone: string
  titre: string
  children?: ReactNode
  role?: 'alert' | 'status'
  pleine?: boolean
}) {
  const cls = ['bandeau', type ? `bandeau--${type}` : '', pleine ? 'bandeau--pleine-largeur' : ''].join(' ').trim()
  return (
    <div className={cls} role={role}>
      <Icone nom={icone} />
      <div className="bandeau__corps"><strong>{titre}</strong>{children && <span>{children}</span>}</div>
    </div>
  )
}

// E-10 : bandeaux transverses en haut de page (blocage, crédit épuisé).
export function BandeauxGlobaux() {
  const { redacteur } = useSession()
  if (!redacteur) return null
  const bloque = redacteur.bloqueJusqua && redacteur.bloqueJusqua > Date.now()
  return (
    <>
      {bloque ? (
        <div className="bandeau bandeau--erreur bandeau--pleine-largeur" role="alert">
          <Icone nom="interdit" />
          <span><strong>Écriture suspendue jusqu'à {heureWat(redacteur.bloqueJusqua!)}.</strong> Trop de tentatives refusées en peu de temps.</span>
        </div>
      ) : redacteur.credit.restant <= 0 ? (
        <div className="bandeau bandeau--attente bandeau--pleine-largeur" role="alert">
          <Icone nom="alerte" />
          <span><strong>Crédit du jour épuisé.</strong> Vous retrouvez {nombre(CREDIT_JOURNALIER)} caractères {texteRecharge(redacteur.credit.rechargeA)}. Vous pouvez lire, supprimer et restaurer.</span>
        </div>
      ) : null}
    </>
  )
}

// En-tête de l'application (E-02 et suivants).
export function EnteteApp({ avecCredit = false, lienRetour = false }: { avecCredit?: boolean; lienRetour?: boolean }) {
  const { redacteur, quitter } = useSession()
  const nav = useNavigate()
  return (
    <header className="entete-app">
      <div className="entete-app__contenu">
        <Link className="marque" to="/documents"><img src="/favicon.svg" alt="" />B-SyncText</Link>
        {lienRetour && <Link className="petit" to="/documents">← Mes documents</Link>}
        <span className="espace"></span>
        {avecCredit && redacteur && (
          <div className="credit">
            <div className="credit__texte"><span>Crédit du jour</span><strong>{nombre(redacteur.credit.restant)} / {nombre(CREDIT_JOURNALIER)}</strong></div>
            <Barre pourcent={(redacteur.credit.restant / CREDIT_JOURNALIER) * 100} variante={redacteur.credit.restant < 500 ? 'danger' : undefined}
              libelle={`${Math.round((redacteur.credit.restant / CREDIT_JOURNALIER) * 100)} % du crédit restant`} />
            <span className="tres-petit doux"><Icone nom="horloge" /> Recharge {texteRecharge(redacteur.credit.rechargeA)}</span>
          </div>
        )}
        {redacteur && <Pastille nom={redacteur.nom} email={redacteur.email} />}
        {redacteur && !lienRetour && (
          <button className="bouton bouton--discret bouton--petit" type="button" onClick={() => { quitter(); nav('/') }}>
            <Icone nom="quitter" />Quitter
          </button>
        )}
      </div>
    </header>
  )
}

// Fenêtre modale (E-04, E-06) : Échap ferme, focus sur le bouton Fermer.
export function Fenetre({ titreId, titre, onFermer, children }: {
  titreId: string; titre: string; onFermer: () => void; children: ReactNode
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onFermer])
  return (
    <div className="scene__voile scene__voile--fixe">
      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby={titreId}>
        <div className="fenetre__tete">
          <h2 id={titreId}>{titre}</h2>
          <button className="bouton bouton--discret bouton--petit" type="button" aria-label="Fermer" onClick={onFermer} autoFocus>
            <Icone nom="fermer" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Garde : redirige vers l'entrée sans session.
export function Protege({ children }: { children: ReactNode }) {
  const { jeton, pret } = useSession()
  const nav = useNavigate()
  useEffect(() => { if (pret && !jeton) nav('/', { replace: true }) }, [pret, jeton, nav])
  if (!pret || !jeton) return <p className="centre doux" role="status" style={{ padding: 'var(--e-7)' }}>Chargement…</p>
  return <>{children}</>
}

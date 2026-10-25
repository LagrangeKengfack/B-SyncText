import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { heureWat, initiales, nombre, nomCourt, texteRecharge, CREDIT_JOURNALIER } from '../format.ts'
import { useSession } from '../session.tsx'
import type { Credit } from '../api.ts'

export function Icone({ nom }: { nom: string }) {
  return <i className={`ico ico-${nom}`} aria-hidden="true"></i>
}

// Classe posée sur <body> pendant l'affichage d'une page (fonds de l'accueil, de l'éditeur, de la page publique).
export function useClasseBody(classe: string) {
  useEffect(() => {
    document.body.classList.add(classe)
    return () => document.body.classList.remove(classe)
  }, [classe])
}

// Cercle d'initiales ; le nom s'affiche au survol et au focus clavier.
export function Avatar({ nom, couleur, taille, titre }: { nom: string; couleur: string; taille?: 's' | 'l'; titre?: string }) {
  const libelle = titre ?? nom
  return (
    <span className={`avatar${taille ? ` avatar--${taille}` : ''}`} style={{ '--c': couleur } as CSSProperties}
      tabIndex={0} data-nom={libelle} aria-label={libelle}>{initiales(nom)}</span>
  )
}

export function Barre({ pourcent, variante, libelle, rayee = false, grosse = false }: {
  pourcent: number; variante?: 'danger' | 'attention'; libelle: string; rayee?: boolean; grosse?: boolean
}) {
  const p = Math.max(0, Math.min(100, pourcent))
  const cls = ['barre', rayee ? 'barre--rayee' : '', variante ? `barre--${variante}` : '', grosse ? 'barre--grosse' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls} role="img" aria-label={libelle}>
      <div className="barre__plein" style={{ '--p': `${p}%` } as CSSProperties}></div>
    </div>
  )
}

// Crédit d'écriture : anneau + texte. `flottant` = pilule fixée en bas de l'éditeur (avec recharge et unité).
export function CreditPilule({ credit, flottant = false }: { credit: Credit; flottant?: boolean }) {
  const p = Math.round((credit.restant / CREDIT_JOURNALIER) * 100)
  const faible = credit.restant < 1000
  const pilule = (
    <div className="credit-pilule" title="Crédit d'écriture du jour">
      <div className={`anneau${faible ? ' anneau--danger' : ''}`} style={{ '--p': p } as CSSProperties} aria-hidden="true"><span>{p}%</span></div>
      <div className="credit-pilule__texte">
        {flottant
          ? <span>Crédit du jour<span className="credit-pilule__recharge"> · recharge {texteRecharge(credit.rechargeA)}</span></span>
          : <span>Crédit du jour</span>}
        <strong>{nombre(credit.restant)} / {nombre(CREDIT_JOURNALIER)}{flottant ? ' caractères' : ''}</strong>
      </div>
    </div>
  )
  return flottant ? <div className="credit-flottant" role="status">{pilule}</div> : pilule
}

export function Bandeau({ type, icone, titre, children, role, pleine }: {
  type?: 'succes' | 'attente' | 'avert' | 'erreur' | 'epuise'
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
        <div className="bandeau bandeau--avert bandeau--pleine-largeur" role="alert">
          <Icone nom="alerte" />
          <span><strong>Crédit du jour épuisé.</strong> Vous retrouvez {nombre(CREDIT_JOURNALIER)} caractères {texteRecharge(redacteur.credit.rechargeA)}. Vous pouvez lire, supprimer et restaurer.</span>
        </div>
      ) : null}
    </>
  )
}

export function Marque({ vers, grande = false, texte = true }: { vers?: string; grande?: boolean; texte?: boolean }) {
  const contenu = <><img src="/logo-clair.svg" alt="" />{texte && 'B-SyncText'}</>
  const cls = `marque${grande ? ' marque--grande' : ''}`
  return vers
    ? <Link className={cls} to={vers} {...(texte ? {} : { 'aria-label': 'Retour à mes documents', title: 'Mes documents' })}>{contenu}</Link>
    : <span className={cls}>{contenu}</span>
}

// En-tête de la page « Mes documents » (E-02).
export function EnteteApp() {
  const { redacteur, quitter } = useSession()
  const nav = useNavigate()
  return (
    <header className="barre-app">
      <div className="barre-app__contenu">
        <Marque vers="/documents" />
        <span className="espace"></span>
        {redacteur && <CreditPilule credit={redacteur.credit} />}
        {redacteur && (
          <span className="pilule-compte">
            <span className="avatar avatar--s" style={{ '--c': 'var(--presence-1)' } as CSSProperties} aria-hidden="true">{initiales(redacteur.nom)}</span>
            {nomCourt(redacteur.nom)}
          </span>
        )}
        {redacteur && (
          <button className="bouton-rond" type="button" aria-label="Quitter" title="Quitter" onClick={() => { quitter(); nav('/') }}>
            <Icone nom="quitter" />
          </button>
        )}
      </div>
    </header>
  )
}

// Fenêtre modale (E-02, E-04, E-06) : Échap ferme, focus sur le bouton Fermer.
export function Fenetre({ titreId, titre, onFermer, children, largeur }: {
  titreId: string; titre: string; onFermer: () => void; children: ReactNode; largeur?: number
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onFermer])
  return (
    <div className="scene__voile voile-fixe">
      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby={titreId} style={largeur ? { maxWidth: largeur } : undefined}>
        <div className="fenetre__tete">
          <h2 id={titreId}>{titre}</h2>
          <button className="bouton-rond" type="button" aria-label="Fermer" onClick={onFermer} autoFocus>
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

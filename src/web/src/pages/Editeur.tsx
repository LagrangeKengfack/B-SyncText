import { HocuspocusProvider } from '@hocuspocus/provider'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as Y from 'yjs'
import { api, ErreurApi, type DocumentDetail, type Version } from '../api.ts'
import { Avatar, Bandeau, CreditPilule, Icone, Marque, useClasseBody } from '../composants/commun.tsx'
import Historique, { type Apercu } from '../composants/Historique.tsx'
import Liens from '../composants/Liens.tsx'
import Partager from '../composants/Partager.tsx'
import ZoneEdition from '../composants/ZoneEdition.tsx'
import { couleurPour, heureWat, nombre, texteRecharge, CREDIT_JOURNALIER } from '../format.ts'
import { useSession } from '../session.tsx'

interface Collab { doc: Y.Doc; provider: HocuspocusProvider }
interface Refus { texte: string }
interface Present { email: string; nom: string }

function urlCollab(): string {
  const env = import.meta.env.VITE_URL_COLLAB as string | undefined
  if (env) return env
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/collab`
}

function useMediaQuery(requete: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(requete)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(requete).matches,
  )
}

// Heure courante rafraîchie (fin d'un blocage).
function useMaintenant(pas: number): number {
  const [t, setT] = useState(Date.now())
  useEffect(() => { const i = setInterval(() => setT(Date.now()), pas); return () => clearInterval(i) }, [pas])
  return t
}

// E-03 : éditeur collaboratif, avec historique (E-05 sur téléphone), partager (E-04) et liens (E-06).
export default function Editeur() {
  const { docId = '' } = useParams()
  const { jeton, redacteur, majCredit, majBlocage } = useSession()
  const compact = useMediaQuery('(max-width: 640px)')
  useClasseBody('editeur-page')
  const [cibleOutils, setCibleOutils] = useState<HTMLElement | null>(null)
  const maintenant = useMaintenant(15_000)

  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [erreurDoc, setErreurDoc] = useState('')
  const [titre, setTitre] = useState('')
  const [collab, setCollab] = useState<Collab | null>(null)
  const [epoque, setEpoque] = useState(0)
  const [statut, setStatut] = useState('connecting')
  const [synced, setSynced] = useState(false)
  const [nonSync, setNonSync] = useState(0)
  const [lectureServeur, setLectureServeur] = useState(false)
  const [erreurCollab, setErreurCollab] = useState('')
  const [presents, setPresents] = useState<Present[]>([])
  const [refus, setRefus] = useState<Refus | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [msgVersion, setMsgVersion] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null)
  const [fenetre, setFenetre] = useState<'partager' | 'liens' | null>(null)
  const [panneau, setPanneau] = useState(false)

  const credit = redacteur?.credit
  const creditRef = useRef(credit)
  useEffect(() => { creditRef.current = credit })
  const collabRef = useRef<Collab | null>(null)
  useEffect(() => { collabRef.current = collab })

  const bloque = !!redacteur?.bloqueJusqua && redacteur.bloqueJusqua > maintenant
  const editable = !bloque && !lectureServeur && !apercu
  const estProprietaire = doc?.role === 'principal' || doc?.role === 'proprietaire'

  // Document (titre, rôle)
  useEffect(() => {
    let actif = true
    api.document(docId).then((d) => { if (actif) { setDoc(d); setTitre(d.titre) } })
      .catch((e) => { if (actif) setErreurDoc(e instanceof ErreurApi && e.statut === 404 ? 'Document introuvable.' : e instanceof ErreurApi && e.statut === 403 ? 'Vous n\'avez pas accès à ce document.' : 'Chargement impossible.') })
    return () => { actif = false }
  }, [docId])

  const chargerVersions = useCallback(() => {
    api.versions(docId).then(setVersions).catch(() => {})
  }, [docId])
  useEffect(chargerVersions, [chargerVersions])

  // Connexion temps réel. Recréée en entier (provider + Y.Doc) après un refus du serveur.
  useEffect(() => {
    if (!jeton) return
    const ydoc = new Y.Doc()
    let vivant = true
    const provider = new HocuspocusProvider({
      url: urlCollab(),
      name: docId,
      token: jeton,
      document: ydoc,
      onStatus: ({ status }) => { if (vivant) setStatut(status) },
      onSynced: ({ state }) => { if (vivant) setSynced(state) },
      onUnsyncedChanges: ({ number }) => { if (vivant) setNonSync(number) },
      onAuthenticated: ({ scope }) => { if (vivant) { setLectureServeur(scope === 'readonly'); setErreurCollab('') } },
      onAuthenticationFailed: ({ reason }) => { if (vivant) setErreurCollab(reason || 'Accès refusé') },
      onAwarenessChange: ({ states }) => {
        if (!vivant) return
        const vus = new Map<string, Present>()
        for (const s of states) {
          const u = s.user as { name?: string; email?: string } | undefined
          if (u?.email && u.name) vus.set(u.email, { email: u.email, nom: u.name })
        }
        setPresents([...vus.values()])
      },
      onStateless: ({ payload }) => {
        if (!vivant) return
        let m: Record<string, unknown>
        try { m = JSON.parse(payload) } catch { return }
        switch (m.type) {
          case 'credit':
            majCredit({ restant: m.restant as number, rechargeA: m.rechargeA as number | undefined })
            break
          case 'refus': {
            if (typeof m.restant === 'number') majCredit({ restant: m.restant, rechargeA: m.rechargeA as number | undefined })
            if (m.raison === 'bloque') majBlocage((m.bloqueJusqua as number | undefined) ?? Date.now() + 15 * 60_000)
            const restant = m.restant as number | undefined
            const texte = m.raison === 'taille'
              ? 'Le document a atteint sa taille maximale. Rien n\'a été inséré.'
              : m.raison === 'bloque'
                ? 'Votre écriture est suspendue. Rien n\'a été inséré.'
                : `Cette insertion dépasse votre crédit${restant !== undefined ? ` ; il vous en reste ${nombre(restant)} aujourd'hui` : ''}. Rien n'a été inséré. Vous pouvez coller un extrait plus court ou supprimer du texte.`
            setRefus({ texte })
            setEpoque((e) => e + 1) // jeter le Y.Doc local et se resynchroniser proprement
            break
          }
          case 'bloque':
            majBlocage((m.bloqueJusqua as number | undefined) ?? Date.now() + 15 * 60_000)
            break
          case 'versionCreee':
            setMsgVersion({ type: 'ok', texte: `Version ${m.numero ?? ''} créée` })
            api.versions(docId).then(setVersions).catch(() => {})
            break
          case 'erreur':
            setMsgVersion({ type: 'erreur', texte: String(m.message ?? 'Action impossible.') })
            break
        }
      },
    })
    setSynced(false); setNonSync(0); setStatut('connecting')
    setCollab({ doc: ydoc, provider })
    return () => {
      vivant = false
      setCollab(null)
      provider.destroy()
      ydoc.destroy()
    }
  }, [docId, jeton, epoque, majCredit, majBlocage])

  // Actions de crédit (H-04) : lues par l'extension au moment de chaque transaction.
  const actions = useMemo(() => ({
    lireRestant: () => (creditRef.current ? creditRef.current.restant : null),
    consommer: (n: number) => {
      if (creditRef.current) {
        const restant = Math.max(0, creditRef.current.restant - n)
        creditRef.current = { ...creditRef.current, restant }
        majCredit({ restant })
      }
    },
    refuser: (n: number, restant: number) => {
      const r = creditRef.current
      setRefus({
        texte: `Cette insertion fait ${nombre(n)} caractère${n > 1 ? 's' : ''} ; il vous en reste ${nombre(restant)} aujourd'hui. Rien n'a été inséré.${r ? ` Recharge ${texteRecharge(r.rechargeA)}.` : ''} Vous pouvez coller un extrait plus court ou supprimer du texte.`,
      })
    },
  }), [majCredit])

  function envoyer(message: object) {
    collabRef.current?.provider.sendStateless(JSON.stringify(message))
  }

  function choisirVersion(v: Version | null) {
    setMsgVersion(null)
    if (!v) { setApercu(null); return }
    setApercu({ version: v, contenu: null })
    api.version(docId, v.versionId)
      .then((r) => setApercu((a) => (a && a.version.versionId === v.versionId ? { version: v, contenu: r.contenu ?? '' } : a)))
      .catch(() => { setApercu(null); setMsgVersion({ type: 'erreur', texte: 'Aperçu impossible.' }) })
  }

  function restaurer(versionId: string) {
    envoyer({ type: 'restaurer', versionId })
    setApercu(null)
    setPanneau(false)
  }

  async function renommer() {
    if (!doc || titre.trim() === doc.titre || !titre.trim()) return
    try { await api.renommer(docId, titre.trim()); setDoc({ ...doc, titre: titre.trim() }) } catch { setTitre(doc.titre) }
  }

  // Indicateur d'enregistrement
  const indicateur = bloque || lectureServeur
    ? { cls: 'statut--erreur', ico: 'cadenas', texte: 'Lecture seule' }
    : statut === 'disconnected'
      ? { cls: 'statut--erreur', ico: 'hors-ligne', texte: nonSync > 0 ? `Hors ligne · ${nonSync} modification${nonSync > 1 ? 's' : ''} en attente` : 'Hors ligne' }
      : !synced || nonSync > 0
        ? { cls: 'statut--attente', ico: 'synchro', texte: 'Synchronisation…' }
        : { cls: 'statut--ok', ico: 'enregistre', texte: 'Enregistré' }

  if (erreurDoc) {
    return (<><header className="barre-app"><div className="barre-app__contenu"><Marque vers="/documents" /></div></header>
      <main className="conteneur conteneur--moyen" style={{ padding: 'var(--e-5) var(--e-4)' }}>
        <Bandeau type="erreur" icone="alerte" role="alert" titre={erreurDoc}><Link to="/documents">Retour à mes documents</Link></Bandeau></main></>)
  }
  if (!redacteur || !credit) return null

  const utilisateur = { name: redacteur.nom, color: couleurPour(redacteur.email), email: redacteur.email }
  const autres = presents.filter((p) => p.email !== redacteur.email)
  const nbConnectes = autres.length + 1
  const libelleApercu = apercu ? `${apercu.version.numero ?? ''}${apercu.version.nom ? ` — ${apercu.version.nom}` : ''}`.trim() : ''
  const histo = (
    <Historique versions={versions} format={doc?.formatVersion} dernierNumero={doc?.derniereVersion?.numero} membres={doc?.membres ?? []} apercu={apercu} estProprietaire={!!estProprietaire} lectureSeule={bloque || lectureServeur}
      nbConnectes={nbConnectes} message={msgVersion} compact={compact} onChoisir={choisirVersion}
      onCreer={(nom, niveau) => envoyer({ type: 'creerVersion', nom, niveau })} onRestaurer={restaurer} onFermer={() => setPanneau(false)} />
  )

  const enLigne = [{ email: redacteur.email, nom: redacteur.nom }, ...autres]
  const faible = !bloque && credit.restant > 0 && credit.restant < 1000
  const epuise = !bloque && credit.restant <= 0
  const horsLigne = statut === 'disconnected' && !erreurCollab
  const aBandeau = !!erreurCollab || horsLigne || bloque || epuise || faible

  return (
    <>
      <div className="editeur__haut">
        <div className="editeur__haut-contenu">
          <Marque vers="/documents" texte={false} />
          <div className="editeur__identite">
            <input className="editeur__titre" aria-label="Titre du document" value={titre} disabled={!editable}
              onChange={(e) => setTitre(e.target.value)} onBlur={renommer} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            <span className={`statut ${indicateur.cls}`} role="status"><Icone nom={indicateur.ico} />{indicateur.texte}</span>
          </div>
          <div className="avatars" role="group" aria-label="Personnes connectées dans ce document">
            {enLigne.map((p, i) => (
              <Avatar key={p.email} nom={p.nom} couleur={couleurPour(p.email)} titre={i === 0 ? `${p.nom} (vous)` : p.nom} />
            ))}
          </div>
          {compact && <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => setPanneau(true)}><Icone nom="historique" />Versions</button>}
          <button className="bouton bouton--secondaire bouton--petit" type="button" onClick={() => setFenetre('liens')}><Icone nom="lien" />Liens</button>
          {estProprietaire && <button className="bouton bouton--principal bouton--petit" type="button" onClick={() => setFenetre('partager')}><Icone nom="partager" />Partager</button>}
        </div>
      </div>

      <div className="outils-zone" ref={setCibleOutils}></div>

      <div className="editeur__corps">
        {!compact && histo}
        <div className="canvas">
          {aBandeau && (
            <div className="bandeau-canvas pile--s">
              {erreurCollab && <Bandeau type="erreur" icone="alerte" role="alert" titre="Connexion refusée">{erreurCollab}</Bandeau>}
              {horsLigne && (
                <Bandeau type="erreur" icone="hors-ligne" role="alert" titre="Hors ligne">Vos modifications seront envoyées au retour de la connexion. Tant qu'elles ne sont pas enregistrées, elles ne sont pas acceptées.</Bandeau>
              )}
              {bloque && (
                <Bandeau type="erreur" icone="interdit" role="alert" titre={`Écriture suspendue jusqu'à ${heureWat(redacteur.bloqueJusqua!)}`}>
                  Trop de tentatives refusées en peu de temps. Vous pouvez lire le document et voir les autres écrire ; le blocage se lève tout seul.
                </Bandeau>
              )}
              {epuise && (
                <Bandeau type="avert" icone="alerte" role="status" titre="Crédit du jour épuisé.">
                  Vous retrouvez {nombre(CREDIT_JOURNALIER)} caractères {texteRecharge(credit.rechargeA)}. Supprimer du texte reste possible.
                </Bandeau>
              )}
              {faible && (
                <Bandeau type="avert" icone="alerte" role="status" titre={`Il vous reste ${nombre(credit.restant)} caractères aujourd'hui.`}>
                  Au-delà, vos insertions seront refusées jusqu'à la recharge, {texteRecharge(credit.rechargeA)}. Supprimer du texte reste possible.
                </Bandeau>
              )}
            </div>
          )}
          {collab ? (
            <ZoneEdition key={epoque} doc={collab.doc} provider={collab.provider} utilisateur={utilisateur} editable={editable}
              actions={actions} apercu={apercu} libelleApercu={libelleApercu} onRevenir={() => choisirVersion(null)} cibleOutils={cibleOutils}
              refus={refus && (
                <div className="collage-refuse" role="alert">
                  <p><Icone nom="interdit" /> <strong>Insertion refusée.</strong> {refus.texte}{' '}
                    <button className="bouton-lien" type="button" onClick={() => setRefus(null)}>Fermer</button></p>
                </div>
              )} />
          ) : (
            <article className="a4" aria-busy="true"><p className="doux" role="status">Resynchronisation…</p></article>
          )}
        </div>
      </div>

      <CreditPilule credit={credit} flottant />

      {compact && panneau && histo}
      {fenetre === 'partager' && <Partager docId={docId} onFermer={() => setFenetre(null)} />}
      {fenetre === 'liens' && <Liens docId={docId} titreDoc={doc?.titre ?? ''} onFermer={() => setFenetre(null)} />}
    </>
  )
}

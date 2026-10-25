import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ecrireJeton, ErreurApi, lireJeton, type Credit, type Redacteur } from './api.ts'

interface ContexteSession {
  jeton: string | null
  redacteur: Redacteur | null
  pret: boolean
  entrer: (nom: string, email: string) => Promise<void>
  quitter: () => void
  majCredit: (c: Partial<Credit>) => void
  majBlocage: (jusqua: number) => void
}

const Ctx = createContext<ContexteSession | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [jeton, setJeton] = useState<string | null>(lireJeton())
  const [redacteur, setRedacteur] = useState<Redacteur | null>(null)
  const [pret, setPret] = useState(!lireJeton())

  // Au chargement : retrouver le rédacteur avec le jeton stocké.
  useEffect(() => {
    if (!jeton || redacteur) return
    let actif = true
    api.moi()
      .then((r) => { if (actif) { setRedacteur(r); setPret(true) } })
      .catch((e) => {
        if (!actif) return
        if (e instanceof ErreurApi && (e.statut === 401 || e.statut === 403)) {
          ecrireJeton(null)
          setJeton(null)
        }
        setPret(true)
      })
    return () => { actif = false }
  }, [jeton, redacteur])

  const entrer = useCallback(async (nom: string, email: string) => {
    const r = await api.session(nom, email)
    ecrireJeton(r.jeton)
    setJeton(r.jeton)
    setRedacteur(r.redacteur)
    setPret(true)
  }, [])

  const quitter = useCallback(() => {
    ecrireJeton(null)
    setJeton(null)
    setRedacteur(null)
  }, [])

  // Fusionne : un message du serveur peut ne donner que « restant ».
  const majCredit = useCallback((c: Partial<Credit>) => {
    setRedacteur((r) => {
      if (!r) return r
      const credit = { ...r.credit }
      if (typeof c.restant === 'number') credit.restant = c.restant
      if (typeof c.rechargeA === 'number') credit.rechargeA = c.rechargeA
      return { ...r, credit }
    })
  }, [])
  const majBlocage = useCallback((bloqueJusqua: number) => {
    setRedacteur((r) => (r ? { ...r, bloqueJusqua } : r))
  }, [])

  const valeur = useMemo(
    () => ({ jeton, redacteur, pret, entrer, quitter, majCredit, majBlocage }),
    [jeton, redacteur, pret, entrer, quitter, majCredit, majBlocage],
  )
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>
}

export function useSession(): ContexteSession {
  const c = useContext(Ctx)
  if (!c) throw new Error('SessionProvider manquant')
  return c
}

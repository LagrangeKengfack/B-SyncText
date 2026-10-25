import type { HocuspocusProvider } from '@hocuspocus/provider'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import TextAlign from '@tiptap/extension-text-align'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import type * as Y from 'yjs'
import BarreOutils from './BarreOutils.tsx'
import { Contenu } from './Contenu.tsx'
import { Icone } from './commun.tsx'
import { LimiteCredit } from './limiteCredit.ts'
import type { Apercu } from './Historique.tsx'

export interface Utilisateur { name: string; color: string; email: string }
export interface ActionsCredit {
  lireRestant: () => number | null
  consommer: (n: number) => void
  refuser: (n: number, restant: number) => void
}

// Barre de mise en forme + feuille. Remontée à chaque nouvelle connexion (key) après un refus.
export default function ZoneEdition({ doc, provider, utilisateur, editable, actions, apercu, libelleApercu, onRevenir, refus }: {
  doc: Y.Doc
  provider: HocuspocusProvider
  utilisateur: Utilisateur
  editable: boolean
  actions: ActionsCredit
  apercu: Apercu | null
  libelleApercu: string
  onRevenir: () => void
  refus: React.ReactNode
}) {
  const actionsRef = useRef(actions)
  useEffect(() => { actionsRef.current = actions })

  const editor = useEditor({
    extensions: [
      // Pas d'historique local (Yjs gère) ; uniquement ce que le contrat prévoit.
      StarterKit.configure({
        undoRedo: false, heading: { levels: [1, 2, 3] },
        blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, link: false, trailingNode: false,
      }),
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      Collaboration.configure({ document: doc, field: 'default' }),
      CollaborationCaret.configure({
        provider,
        user: utilisateur,
        render: (u) => {
          const el = document.createElement('span')
          el.className = 'curseur-collab'
          el.style.setProperty('--c', u.color)
          const nom = document.createElement('span')
          nom.className = 'curseur-collab__nom'
          nom.textContent = u.name
          el.appendChild(nom)
          return el
        },
        selectionRender: (u) => ({ nodeName: 'span', class: 'selection', style: `--c: ${u.color}` }),
      }),
      LimiteCredit.configure({
        lireRestant: () => actionsRef.current.lireRestant(),
        consommer: (n) => actionsRef.current.consommer(n),
        refuser: (n, r) => actionsRef.current.refuser(n, r),
      }),
    ],
    editable,
    editorProps: { attributes: { 'aria-label': 'Contenu du document', role: 'textbox', 'aria-multiline': 'true' } },
  }, [doc, provider])

  useEffect(() => { editor?.setEditable(editable) }, [editor, editable])

  return (
    <>
      {editor && <BarreOutils editor={editor} desactive={!editable} />}
      <div className="feuille-zone">
        {apercu && (
          <>
            <div className="bandeau bandeau-apercu" role="status">
              <Icone nom="oeil" />
              <div className="bandeau__corps"><strong>Aperçu de {libelleApercu} (lecture seule)</strong>
                <span>Vous regardez une ancienne version. Le document en cours n'est pas modifié. <button className="bouton-lien" type="button" onClick={onRevenir}>Revenir à la version actuelle</button>.</span></div>
            </div>
            <article className="feuille" aria-readonly="true" aria-label={`Contenu de la version ${apercu.version.numero ?? ''}`}>
              {apercu.contenu === null ? <p className="doux">Chargement…</p> : <Contenu contenu={apercu.contenu} />}
            </article>
          </>
        )}
        <article className="feuille" hidden={!!apercu} aria-readonly={!editable}>
          {refus}
          <EditorContent editor={editor} />
        </article>
      </div>
    </>
  )
}

import { useEditorState, type Editor } from '@tiptap/react'
import { Icone } from './commun.tsx'

type Alignement = 'left' | 'center' | 'right' | 'justify'
const ALIGNEMENTS: { v: Alignement; libelle: string; icone: string }[] = [
  { v: 'left', libelle: 'Aligner à gauche', icone: 'gauche' },
  { v: 'center', libelle: 'Centrer', icone: 'centre' },
  { v: 'right', libelle: 'Aligner à droite', icone: 'droite' },
  { v: 'justify', libelle: 'Justifier', icone: 'justifie' },
]

// Barre de mise en forme de E-03.
export default function BarreOutils({ editor, desactive }: { editor: Editor; desactive: boolean }) {
  const e = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      gras: ed.isActive('bold'),
      italique: ed.isActive('italic'),
      souligne: ed.isActive('underline'),
      puces: ed.isActive('bulletList'),
      numerotee: ed.isActive('orderedList'),
      titre: ([1, 2, 3] as const).find((n) => ed.isActive('heading', { level: n })) ?? 0,
      align: ALIGNEMENTS.find((a) => ed.isActive({ textAlign: a.v }))?.v ?? 'left',
    }),
  })
  const bouton = (libelle: string, actif: boolean, action: () => void, contenu: React.ReactNode, style?: React.CSSProperties) => (
    <button className="outil" type="button" aria-label={libelle} title={libelle} aria-pressed={actif} disabled={desactive} style={style}
      onMouseDown={(ev) => ev.preventDefault()} onClick={action}>{contenu}</button>
  )
  const c = () => editor.chain().focus()
  return (
    <div className="outils" role="toolbar" aria-label="Mise en forme">
        <div className="outils__groupe">
          <select aria-label="Style de paragraphe" disabled={desactive} value={e.titre}
            onChange={(ev) => {
              const n = Number(ev.target.value)
              if (n === 0) c().setParagraph().run()
              else c().setHeading({ level: n as 1 | 2 | 3 }).run()
            }}>
            <option value={0}>Paragraphe</option><option value={1}>Titre 1</option><option value={2}>Titre 2</option><option value={3}>Titre 3</option>
          </select>
        </div>
        <div className="outils__groupe">
          {bouton('Gras', e.gras, () => c().toggleBold().run(), 'G')}
          {bouton('Italique', e.italique, () => c().toggleItalic().run(), 'I', { fontStyle: 'italic' })}
          {bouton('Souligné', e.souligne, () => c().toggleUnderline().run(), 'S', { textDecoration: 'underline' })}
        </div>
        <div className="outils__groupe">
          {ALIGNEMENTS.map((a) => bouton(a.libelle, e.align === a.v, () => c().setTextAlign(a.v).run(), <Icone nom={a.icone} />))}
        </div>
        <div className="outils__groupe">
          {bouton('Liste à puces', e.puces, () => c().toggleBulletList().run(), <Icone nom="liste" />)}
          {bouton('Liste numérotée', e.numerotee, () => c().toggleOrderedList().run(), <Icone nom="liste-num" />)}
        </div>
    </div>
  )
}

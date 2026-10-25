// Rendu en lecture seule du contenu d'une version (E-03 aperçu, E-05).
// Le format exact vient du serveur (blocs neutres) ; on accepte aussi du texte brut.
interface Segment { texte?: string; gras?: boolean; italique?: boolean; souligne?: boolean }
interface Bloc { type?: string; niveau?: number; alignement?: string; segments?: Segment[]; texte?: string }

function versBlocs(contenu: unknown): Bloc[] {
  if (typeof contenu === 'string') return contenu.split('\n').map((texte) => ({ type: 'paragraph', texte }))
  if (Array.isArray(contenu)) return contenu as Bloc[]
  if (contenu && typeof contenu === 'object' && Array.isArray((contenu as { blocs?: unknown }).blocs)) {
    return (contenu as { blocs: Bloc[] }).blocs
  }
  return []
}

function Segments({ bloc }: { bloc: Bloc }) {
  if (!bloc.segments) return <>{bloc.texte ?? ''}</>
  return (
    <>
      {bloc.segments.map((s, i) => {
        let el: React.ReactNode = s.texte ?? ''
        if (s.gras) el = <strong>{el}</strong>
        if (s.italique) el = <em>{el}</em>
        if (s.souligne) el = <u>{el}</u>
        return <span key={i}>{el}</span>
      })}
    </>
  )
}

export function Contenu({ contenu }: { contenu: unknown }) {
  const blocs = versBlocs(contenu)
  if (blocs.length === 0) return <p className="doux">Cette version est vide.</p>
  let numero = 0
  return (
    <>
      {blocs.map((b, i) => {
        const align = ['center', 'right', 'justify'].includes(b.alignement ?? '') ? ({ textAlign: b.alignement } as React.CSSProperties)
          : b.alignement === 'centre' ? { textAlign: 'center' as const } : b.alignement === 'droite' ? { textAlign: 'right' as const } : b.alignement === 'justifie' ? { textAlign: 'justify' as const } : undefined
        const type = (b.type ?? 'paragraph').toLowerCase()
        if (type.startsWith('heading') || type.startsWith('titre')) {
          const N = `h${Math.min(3, Math.max(1, b.niveau ?? 2))}` as 'h1' | 'h2' | 'h3'
          numero = 0
          return <N key={i} style={align}><Segments bloc={b} /></N>
        }
        if (/bullet|puce/.test(type)) { numero = 0; return <p key={i} style={align}>• <Segments bloc={b} /></p> }
        if (/ordered|num/.test(type)) { numero += 1; return <p key={i} style={align}>{numero}. <Segments bloc={b} /></p> }
        numero = 0
        return <p key={i} style={align}><Segments bloc={b} /></p>
      })}
    </>
  )
}

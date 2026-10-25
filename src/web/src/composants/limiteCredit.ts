import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Slice } from '@tiptap/pm/model'

export interface OptionsLimite {
  lireRestant: () => number | null
  consommer: (n: number) => void
  refuser: (n: number, restant: number) => void
}

// Compte les caractères que la transaction insère (texte seulement, comme le serveur).
function caracteresInseres(slice: Slice): number {
  let total = 0
  slice.content.descendants((noeud) => {
    if (noeud.isText) total += noeud.text?.length ?? 0
  })
  return total
}

// H-04 : une insertion (frappe, collage, glisser) qui dépasse le crédit connu est refusée en entier.
// Les transactions venues de Yjs (contenu des autres, resynchronisation) ne sont pas concernées.
export const LimiteCredit = Extension.create<OptionsLimite>({
  name: 'limiteCredit',
  addOptions() {
    return { lireRestant: () => null, consommer: () => {}, refuser: () => {} }
  },
  addProseMirrorPlugins() {
    const opts = this.options
    return [
      new Plugin({
        key: new PluginKey('limiteCredit'),
        filterTransaction(tr) {
          if (!tr.docChanged || tr.getMeta('y-sync$')) return true
          let n = 0
          for (const etape of tr.steps) {
            const slice = (etape as unknown as { slice?: Slice }).slice
            if (slice) n += caracteresInseres(slice)
          }
          if (n === 0) return true
          const restant = opts.lireRestant()
          if (restant === null) return true
          if (n > restant) {
            opts.refuser(n, restant)
            return false
          }
          opts.consommer(n)
          return true
        },
      }),
    ]
  },
})

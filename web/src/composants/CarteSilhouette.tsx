import { useEffect, useRef } from 'react'

import type { EntreeCodex } from '../services/codex'
import { chargerSilhouette } from '../services/silhouettes'
import { bandeau } from './bandeau'

/** La carte du codex sans texte ni bouton : même bandeau, mêmes proportions, silhouette en texture (ADR 0023). */
export function CarteSilhouette({ entree, chemin, lireMedia }: { entree: EntreeCodex; chemin: string; lireMedia: (chemin: string) => Promise<string> }) {
  const hote = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let actif = true
    void chargerSilhouette(chemin, lireMedia).then((svg) => {
      if (actif && svg && hote.current) hote.current.replaceChildren(svg)
    })
    return () => {
      actif = false
    }
  }, [chemin, lireMedia])
  return (
    <div className="mini indice-carte" data-type={entree.type} style={bandeau(entree.type)} aria-hidden="true">
      <span className="m-top" />
      <span ref={hote} className="card-art" />
    </div>
  )
}

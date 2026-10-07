import { Fragment } from 'react'

import type { BriqueJeu } from '../services/jeu'

const SEGMENTS: Record<BriqueJeu['nature'], string> = {
  prefixe: 'var(--c-prefix)',
  suffixe: 'var(--c-suffix)',
  mot: 'var(--paper-2)',
}

/** Mot surligné par morceaux, aux couleurs de ses briques, si les segments le couvrent exactement. */
export function MotSegmente({
  mot,
  morceaux,
  lier,
}: {
  mot: string
  morceaux: { debut: number; fin: number; nature: BriqueJeu['nature'] }[]
  /** Enveloppe un morceau dans un lien vers sa carte (codex), s'il y en a une. */
  lier?: (rang: number, noeud: React.ReactElement<{ className?: string }>) => React.ReactNode
}) {
  const lettres = Array.from(mot)
  const couvre = morceaux.length > 0 && morceaux.every((m, i) => m.debut === (i === 0 ? 0 : morceaux[i - 1]?.fin) && m.fin > m.debut)
  if (!couvre || morceaux[morceaux.length - 1]?.fin !== lettres.length) return <>{mot}</>
  return (
    <>
      {morceaux.map((m, i) => {
        const noeud = (
          <span className="seg" style={{ '--c': SEGMENTS[m.nature], '--i': i } as React.CSSProperties}>
            {lettres.slice(m.debut, m.fin).join('')}
          </span>
        )
        return <Fragment key={m.debut}>{lier ? lier(i, noeud) : noeud}</Fragment>
      })}
    </>
  )
}


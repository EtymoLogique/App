import type { CSSProperties } from 'react'

import type { Ligne } from '../services/ecriture'

/** Lignes de la fenêtre d'écriture d'un pli : brouillons cursifs barrés, puis la brique finale (plis.css, `.sc-line`). */
export function Plume({ lignes }: { lignes: Ligne[] }) {
  return (
    <span className="pk-scribe" aria-hidden="true">
      {lignes.map((l) => (
        <span
          key={l.cle}
          className={['sc-line', l.finale ? 'final' : '', l.nature ? 'sc-brick' : '', l.ancienne ? 'old' : '', l.encree ? 'inked' : ''].filter(Boolean).join(' ')}
          data-kind={l.nature}
        >
          {l.texte}
          {l.saisie && <span className="sc-caret" />}
          {l.barree && (
            <svg className="sc-rature" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path pathLength={100} d="M0 14 L100 5 M4 7 L96 15" />
            </svg>
          )}
        </span>
      ))}
    </span>
  )
}

/**
 * Texte qui s'écrit lettre à lettre (plis.css, `.l`) ; `debut` : rang de sa première lettre dans la révélation.
 * Les lecteurs d'écran lisent le texte entier.
 */
export function Ecrit({ texte, debut }: { texte: string; debut: number }) {
  return (
    <>
      <span className="sr-only">{texte}</span>
      <span aria-hidden="true">
        {Array.from(texte).map((c, i) => (
          <span key={i} className="l" style={{ '--i': debut + i } as CSSProperties}>
            {c}
          </span>
        ))}
      </span>
    </>
  )
}

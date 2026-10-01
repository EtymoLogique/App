import { Fragment, useState } from 'react'

import type { BriqueJeu } from '../services/jeu'
import { TABLE_MAX } from '../services/jeu'
import { Brique } from './Brique'
import { TYPE_GLISSE } from './Reserve'

const TYPE_DEPLACE = 'application/x-etymo-rang'

interface Props {
  /** Cases de la table, chacune à sa place : `null` pour une case vide. */
  table: (string | null)[]
  briques: Map<string, BriqueJeu>
  enAttente: boolean
  onPoser: (brique: string, rang: number) => void
  onDeplacer: (depuis: number, vers: number) => void
  onRetirer: (rang: number) => void
  /** Toucher une case vide : ouvre la réserve pour cette case. */
  onCaseVide: (rang: number) => void
  secousse?: { force: 'legere' | 'forte'; cle: number } | null
  /** Fusion réussie en cours : les deux briques se rejoignent, deux ondes et des confettis (mouvement.html). */
  fusion?: number | null
}

const COULEURS_CONFETTIS = ['var(--c-prefix)', 'var(--c-action)', 'var(--c-suffix)', '#fffbf3']

/** Confettis aux couleurs des briques, répartis en étoile (déterministe : rien d'aléatoire au rendu). */
function Confettis() {
  return (
    <>
      {Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.2
        const distance = 90 + ((i * 37) % 150)
        const style = {
          '--c': COULEURS_CONFETTIS[i % COULEURS_CONFETTIS.length],
          '--dx': `${Math.round(Math.cos(angle) * distance)}px`,
          '--dy': `${Math.round(Math.sin(angle) * distance)}px`,
          '--r': `${((i * 97) % 720) - 360}deg`,
        } as React.CSSProperties
        return <span key={i} className="confetti" style={style} aria-hidden="true" />
      })}
    </>
  )
}

/**
 * Rail de la table de fusion (maquette I-09) : deux cases, reliées
 * par « + », car l'ordre compte. On y glisse une brique ; toucher une case vide ouvre
 * la réserve, toucher une case pleine la vide ; glisser une brique posée sur une autre case les échange.
 */
export function Table({ table, briques, enAttente, onPoser, onDeplacer, onRetirer, onCaseVide, secousse, fusion }: Props) {
  const [survol, setSurvol] = useState<number | null>(null)
  // Secousse déjà jouée : sans cela, elle rejouerait à chaque retour sur la table (display: none relance l'animation).
  const [secouee, setSecouee] = useState<number | null>(null)
  const secoue = secousse && secousse.cle !== secouee && !fusion

  const deposer = (e: React.DragEvent, rang: number) => {
    e.preventDefault()
    setSurvol(null)
    const depuis = e.dataTransfer.getData(TYPE_DEPLACE)
    if (depuis !== '') {
      onDeplacer(Number(depuis), rang)
      return
    }
    const brique = e.dataTransfer.getData(TYPE_GLISSE)
    if (brique) onPoser(brique, rang)
  }

  return (
    <div
      key={`${secousse?.cle ?? 0}-${fusion ?? 0}`}
      className={['slots', secoue ? 'shake' : '', fusion ? 'fusing' : ''].filter(Boolean).join(' ')}
      onAnimationEnd={(e) => e.animationName === 'shake' && setSecouee(secousse?.cle ?? null)}
      role="group"
      aria-label="Briques posées, dans l’ordre"
    >
      {Array.from({ length: TABLE_MAX }, (_, rang) => {
        const id = table[rang]
        const brique = id ? briques.get(id) : undefined
        const classes = ['slot', brique ? 'filled' : '', survol === rang ? 'over' : ''].filter(Boolean).join(' ')
        return (
          <Fragment key={rang}>
            {rang > 0 && (
              <span className="op" aria-hidden="true">
                +
              </span>
            )}
            <button
              type="button"
              className={classes}
              data-slot={rang}
              aria-label={brique ? `Emplacement ${rang + 1} : ${brique.libelle}. Retirer` : `Emplacement ${rang + 1} vide. Choisir une brique`}
              draggable={brique !== undefined}
              onDragStart={(e) => {
                e.dataTransfer.setData(TYPE_DEPLACE, String(rang))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setSurvol(rang)
              }}
              onDragLeave={() => setSurvol(null)}
              onDrop={(e) => deposer(e, rang)}
              onClick={() => !enAttente && (brique ? onRetirer(rang) : onCaseVide(rang))}
              onKeyDown={(e) => {
                if ((e.key === 'Delete' || e.key === 'Backspace') && brique && !enAttente) onRetirer(rang)
                if (e.key === 'ArrowLeft' && brique && rang > 0) onDeplacer(rang, rang - 1)
                if (e.key === 'ArrowRight' && brique && rang < TABLE_MAX - 1) onDeplacer(rang, rang + 1)
              }}
            >
              {brique ? <Brique brique={brique} /> : <span className="slot-num">{rang + 1}</span>}
            </button>
          </Fragment>
        )
      })}
      <span className="burst" aria-hidden="true" />
      {fusion ? <Confettis /> : null}
    </div>
  )
}

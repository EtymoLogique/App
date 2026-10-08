import { Fragment, useLayoutEffect, useRef, useState } from 'react'

import type { BriqueJeu } from '../services/jeu'
import type { FusionEnCours } from '../services/partie'
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
  /** Fusion réussie en cours : les briques s'emboîtent en un mot, avec des traits d'éclat et des lettres (mouvement.html). */
  fusion?: FusionEnCours | null
}

/** Teinte profonde de chaque nature : des lettres lisibles sur le papier. */
const ENCRE_NATURE: Record<BriqueJeu['nature'], string> = { prefixe: 'var(--c-prefix-deep)', suffixe: 'var(--c-suffix-deep)', mot: 'var(--ink)' }
const GLYPHES = Array.from('γλφψαωΣΩ')

/**
 * Éclat de la découverte : le mot formé, huit traits d'encre sur une ellipse autour de lui,
 * et des lettres du mot et de glyphes grecs aux couleurs des briques utilisées.
 * Déterministe : rien d'aléatoire au rendu.
 */
function Eclat({ mot, natures }: FusionEnCours) {
  // Demi-axes de l'ellipse : le mot fait environ 14 px par lettre, plus son cadre.
  const rx = Math.min(160, Array.from(mot).length * 7 + 26)
  const ry = 30
  const couleurs = [...new Set(natures.map((n) => ENCRE_NATURE[n])), 'var(--ink)', 'var(--c-action-deep)']
  const lettres = [...Array.from(mot.replace(/[\s-]/g, '')), ...GLYPHES]
  return (
    <span className="fu-eclat" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        const r = (rx * ry) / Math.hypot(ry * Math.sin(a), rx * Math.cos(a))
        return <i key={`t${i}`} className="fu-trait" style={{ '--a': `${i * 45}deg`, '--r0': `${-Math.round(r)}px` } as React.CSSProperties} />
      })}
      {Array.from({ length: 20 }, (_, i) => {
        const angle = (i / 20) * Math.PI * 2 + (i % 3) * 0.2
        const distance = 90 + ((i * 37) % 120)
        const style = {
          '--c': couleurs[i % couleurs.length],
          '--dx': `${Math.round(Math.cos(angle) * distance * 1.4)}px`,
          '--dy': `${Math.round(Math.sin(angle) * distance * 0.6)}px`,
          '--r': `${((i * 97) % 720) - 360}deg`,
        } as React.CSSProperties
        return (
          <i key={`l${i}`} className="fu-lettre" style={style}>
            {lettres[(i * 7) % lettres.length]}
          </i>
        )
      })}
      <b className="fu-mot">{mot}</b>
    </span>
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
  const rail = useRef<HTMLDivElement>(null)

  // Aimantation : chaque brique parcourt la moitié de l'écart qui la sépare de l'autre, en ligne ou empilée (mobile).
  useLayoutEffect(() => {
    const el = rail.current
    if (!fusion || !el) return
    const a = el.querySelector('[data-slot="0"] .brick')?.getBoundingClientRect()
    const b = el.querySelector('[data-slot="1"] .brick')?.getBoundingClientRect()
    if (!a || !b) return
    const enLigne = b.left >= a.right - 1
    el.style.setProperty('--fx', `${enLigne ? (b.left - a.right) / 2 : 0}px`)
    el.style.setProperty('--fy', `${enLigne ? 0 : (b.top - a.bottom) / 2}px`)
  }, [fusion])

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
      ref={rail}
      key={secousse?.cle ?? 0}
      className={['slots', secoue ? 'shake' : '', secoue && secousse.force === 'legere' ? 'legere' : '', fusion ? 'fusing' : ''].filter(Boolean).join(' ')}
      onAnimationEnd={(e) => e.target === e.currentTarget && e.animationName.startsWith('amorti') && setSecouee(secousse?.cle ?? null)}
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
      {fusion && <Eclat {...fusion} />}
    </div>
  )
}

import { Fragment, useState } from 'react'

import type { BriqueJeu } from '../services/jeu'
import { TABLE_MAX, TABLE_MIN } from '../services/jeu'
import { Brique } from './Brique'
import { TYPE_GLISSE } from './Reserve'

const TYPE_DEPLACE = 'application/x-etymo-rang'

interface Props {
  table: string[]
  briques: Map<string, BriqueJeu>
  enAttente: boolean
  /** Raison pour laquelle la fusion est impossible maintenant, sinon `null`. */
  bloquee: string | null
  onPoser: (brique: string, rang: number) => void
  onDeplacer: (depuis: number, vers: number) => void
  onRetirer: (rang: number) => void
  onVider: () => void
  onFusionner: () => void
  secousse?: { force: 'legere' | 'forte'; cle: number } | null
  /** Emplacements de la plus longue recette publiée : la table n'en montre pas davantage. */
  maximum?: number
}

/**
 * Table de fusion (jeu.html, design système 3.3) : emplacements numérotés,
 * car l'ordre compte. On y glisse une brique, ou on la touche dans la réserve ;
 * toucher une brique posée la rend à la réserve. Glisser une brique posée
 * sur un autre emplacement les échange.
 */
export function Table({ table, briques, enAttente, bloquee, onPoser, onDeplacer, onRetirer, onVider, onFusionner, secousse, maximum = TABLE_MAX }: Props) {
  const [survol, setSurvol] = useState<number | null>(null)
  const emplacements = Math.max(TABLE_MIN, Math.min(maximum, TABLE_MAX, table.length + 1))

  const deposer = (e: React.DragEvent, rang: number) => {
    e.preventDefault()
    setSurvol(null)
    const depuis = e.dataTransfer.getData(TYPE_DEPLACE)
    if (depuis !== '') {
      onDeplacer(Number(depuis), Math.min(rang, table.length - 1))
      return
    }
    const brique = e.dataTransfer.getData(TYPE_GLISSE)
    if (brique) onPoser(brique, rang)
  }

  return (
    <>
      <div key={secousse?.cle ?? 0} className={secousse ? `slots secousse-${secousse.force}` : 'slots'}>
        {Array.from({ length: emplacements }, (_, rang) => {
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
                aria-label={brique ? `Emplacement ${rang + 1} : ${brique.libelle}. Retirer` : `Emplacement ${rang + 1} vide`}
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
                onClick={() => brique && !enAttente && onRetirer(rang)}
              >
                {brique ? <Brique brique={brique} /> : <span className="slot-num">{rang + 1}</span>}
              </button>
            </Fragment>
          )
        })}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onFusionner} disabled={bloquee !== null || table.length < TABLE_MIN || enAttente}>
          {enAttente ? 'Fusion…' : 'Fusionner'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onVider} disabled={table.length === 0 || enAttente}>
          Vider
        </button>
      </div>
    </>
  )
}

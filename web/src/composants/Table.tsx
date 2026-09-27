import { useState } from 'react'

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
  onAjouter: (brique: string, rang?: number) => void
  onDeplacer: (depuis: number, vers: number) => void
  onRetirer: (rang: number) => void
  onVider: () => void
  onFusionner: () => void
  secousse?: { force: 'legere' | 'forte'; cle: number } | null
}

/**
 * Table de fusion (design système 3.3) : emplacements numérotés, car l'ordre
 * compte. Glisser-déposer à la souris, boutons au toucher et au clavier (ADR 0001).
 */
export function Table({ table, briques, enAttente, bloquee, onAjouter, onDeplacer, onRetirer, onVider, onFusionner, secousse }: Props) {
  const [survol, setSurvol] = useState<number | null>(null)
  const emplacements = Math.max(TABLE_MIN, Math.min(TABLE_MAX, table.length + 1))

  const deposer = (e: React.DragEvent, rang: number) => {
    e.preventDefault()
    setSurvol(null)
    const depuis = e.dataTransfer.getData(TYPE_DEPLACE)
    if (depuis !== '') {
      onDeplacer(Number(depuis), Math.min(rang, table.length - 1))
      return
    }
    const brique = e.dataTransfer.getData(TYPE_GLISSE)
    if (brique) onAjouter(brique, Math.min(rang, table.length))
  }

  const raison = bloquee ?? (table.length < TABLE_MIN ? `Posez au moins ${TABLE_MIN} briques.` : null)

  return (
    <>
      <ol
        key={secousse?.cle ?? 0}
        className={secousse ? `slots secousse-${secousse.force}` : 'slots'}
        aria-label="Briques posées, dans l’ordre"
      >
        {Array.from({ length: emplacements }, (_, rang) => {
          const id = table[rang]
          const brique = id ? briques.get(id) : undefined
          const classes = ['slot', brique ? 'filled' : '', survol === rang ? 'over' : ''].filter(Boolean).join(' ')
          return (
            <li
              key={brique ? `${id}-${rang}` : `vide-${rang}`}
              className={classes}
              onDragOver={(e) => {
                e.preventDefault()
                setSurvol(rang)
              }}
              onDragLeave={() => setSurvol(null)}
              onDrop={(e) => deposer(e, rang)}
            >
              <span
                className="slot-case"
                draggable={brique !== undefined}
                onDragStart={(e) => {
                  e.dataTransfer.setData(TYPE_DEPLACE, String(rang))
                  e.dataTransfer.effectAllowed = 'move'
                }}
              >
                {brique ? (
                  <span className="slot-brique" onClick={() => onRetirer(rang)}>
                    <Brique brique={brique} />
                  </span>
                ) : (
                  <span className="slot-num" aria-label={`Emplacement ${rang + 1}, vide`}>
                    {rang + 1}
                  </span>
                )}
              </span>
              {brique && (
                <span className="slot-actions">
                  <button type="button" className="btn-icone" disabled={rang === 0} onClick={() => onDeplacer(rang, rang - 1)} aria-label={`Avancer ${brique.libelle}`}>
                    ←
                  </button>
                  <button type="button" className="btn-icone" disabled={rang === table.length - 1} onClick={() => onDeplacer(rang, rang + 1)} aria-label={`Reculer ${brique.libelle}`}>
                    →
                  </button>
                  <button type="button" className="btn-icone" onClick={() => onRetirer(rang)} aria-label={`Retirer ${brique.libelle}`}>
                    ×
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onVider} disabled={table.length === 0 || enAttente}>
          Vider
        </button>
        <button type="button" className="btn btn-primary" onClick={onFusionner} disabled={raison !== null || enAttente}>
          {enAttente ? 'Fusion…' : 'Fusionner'}
        </button>
      </div>
      {raison && table.length > 0 && <p className="panel-tip">{raison}</p>}
    </>
  )
}

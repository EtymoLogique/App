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
}

/**
 * La table de fusion : l'ordre fait partie de l'hypothèse. Glisser-déposer à
 * la souris, boutons au toucher et au clavier (ADR 0001).
 */
export function Table({ table, briques, enAttente, bloquee, onAjouter, onDeplacer, onRetirer, onVider, onFusionner }: Props) {
  const [survol, setSurvol] = useState<number | null>(null)

  const deposer = (e: React.DragEvent, rang: number) => {
    e.preventDefault()
    setSurvol(null)
    const depuis = e.dataTransfer.getData(TYPE_DEPLACE)
    if (depuis !== '') {
      onDeplacer(Number(depuis), Math.min(rang, table.length - 1))
      return
    }
    const brique = e.dataTransfer.getData(TYPE_GLISSE)
    if (brique) onAjouter(brique, rang)
  }

  const trop = table.length < TABLE_MIN ? `Posez au moins ${TABLE_MIN} briques.` : null
  const raison = bloquee ?? trop

  return (
    <div className="table">
      <ol
        className="table-emplacements"
        aria-label="Briques posées, dans l’ordre"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => deposer(e, table.length)}
      >
        {table.map((id, rang) => {
          const brique = briques.get(id)
          if (!brique) return null
          return (
            <li
              key={`${id}-${rang}`}
              className={survol === rang ? 'emplacement survol' : 'emplacement'}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(TYPE_DEPLACE, String(rang))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setSurvol(rang)
              }}
              onDragLeave={() => setSurvol(null)}
              onDrop={(e) => {
                e.stopPropagation()
                deposer(e, rang)
              }}
            >
              <Brique brique={brique} />
              <span className="emplacement-actions">
                <button
                  type="button"
                  disabled={rang === 0}
                  onClick={() => onDeplacer(rang, rang - 1)}
                  aria-label={`Avancer ${brique.forme}`}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={rang === table.length - 1}
                  onClick={() => onDeplacer(rang, rang + 1)}
                  aria-label={`Reculer ${brique.forme}`}
                >
                  →
                </button>
                <button type="button" onClick={() => onRetirer(rang)} aria-label={`Retirer ${brique.forme}`}>
                  ×
                </button>
              </span>
            </li>
          )
        })}
        {Array.from({ length: TABLE_MAX - table.length }, (_, i) => (
          <li key={`vide-${i}`} className="emplacement vide" aria-hidden="true" />
        ))}
      </ol>
      <div className="table-actions">
        <button type="button" onClick={onVider} disabled={table.length === 0 || enAttente}>
          Vider
        </button>
        <button
          type="button"
          className="principal"
          onClick={onFusionner}
          disabled={raison !== null || enAttente}
          aria-describedby={raison ? 'table-raison' : undefined}
        >
          {enAttente ? 'Fusion…' : 'Fusionner'}
        </button>
      </div>
      {raison && table.length > 0 && (
        <p id="table-raison" className="meta">
          {raison}
        </p>
      )}
    </div>
  )
}

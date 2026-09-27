import type { Exemplaires } from '../contrat'
import type { BriqueJeu } from '../services/jeu'
import { TABLE_MAX } from '../services/jeu'
import { Brique } from './Brique'

export const TYPE_GLISSE = 'application/x-etymo-brique'

interface Props {
  reserve: Exemplaires[]
  briques: Map<string, BriqueJeu>
  table: string[]
  onAjouter: (brique: string) => void
}

export function Reserve({ reserve, briques, table, onAjouter }: Props) {
  const connues = reserve.filter((e) => briques.has(e.brique_id))
  if (connues.length === 0) return <p>Votre réserve est vide pour le moment.</p>

  return (
    <ul className="reserve">
      {connues.map(({ brique_id, exemplaires }) => {
        const brique = briques.get(brique_id) as BriqueJeu
        const poses = table.filter((b) => b === brique_id).length
        const disponibles = exemplaires - poses
        const epuisee = exemplaires === 0
        const raison = epuisee
          ? 'Brique épuisée : elle reviendra par les plis.'
          : disponibles === 0
            ? 'Tous ses exemplaires sont déjà sur la table.'
            : table.length >= TABLE_MAX
              ? `La table accueille ${TABLE_MAX} briques au plus.`
              : null
        return (
          <li key={brique_id}>
            <button
              type="button"
              className="case-brique"
              aria-disabled={raison !== null}
              title={raison ?? 'Ajouter à la table'}
              draggable={raison === null}
              onDragStart={(e) => {
                e.dataTransfer.setData(TYPE_GLISSE, brique_id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => raison === null && onAjouter(brique_id)}
            >
              <Brique brique={brique} disponibles={disponibles} epuisee={epuisee} tousPoses={disponibles === 0} />
              <span className="sr-only">. {raison ?? 'Ajouter à la table.'}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

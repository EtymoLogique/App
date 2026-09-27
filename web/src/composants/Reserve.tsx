import type { Exemplaires } from '../contrat'
import type { BriqueJeu } from '../services/jeu'
import { NATURES } from '../services/jeu'
import { ContenuBrique } from './Brique'

export const TYPE_GLISSE = 'application/x-etymo-brique'

interface Props {
  reserve: Exemplaires[]
  briques: Map<string, BriqueJeu>
  table: string[]
  onAjouter: (brique: string) => void
  /** Message affiché quand on touche une brique indisponible, sans secousse. */
  onIndisponible: (message: string) => void
  /** Briques qui viennent d'être consommées : un « −1 » s'envole au-dessus. */
  consommees?: string[]
}

function exemplaires(n: number): string {
  return `${n} exemplaire${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}`
}

/** Réserve et rationnement (design système 3.2, ADR 0012). */
export function Reserve({ reserve, briques, table, onAjouter, onIndisponible, consommees = [] }: Props) {
  const connues = reserve.filter((e) => briques.has(e.brique_id))
  if (connues.length === 0) return <p className="panel-tip">Votre réserve est vide pour le moment.</p>

  return (
    <ul className="tray">
      {connues.map(({ brique_id, exemplaires: possedes }) => {
        const brique = briques.get(brique_id) as BriqueJeu
        const disponibles = possedes - table.filter((b) => b === brique_id).length
        const epuisee = possedes === 0
        const indisponible = epuisee
          ? `Plus aucun exemplaire de ${brique.libelle}. Ouvrez un pli pour en retrouver.`
          : disponibles <= 0
            ? `Tous vos exemplaires de ${brique.libelle} sont déjà sur la table.`
            : null
        const nom = `${brique.libelle}${brique.glose ? ` (${brique.glose})` : ''}`
        const classes = ['brick', epuisee ? 'is-spent' : disponibles <= 0 ? 'is-out' : ''].filter(Boolean).join(' ')
        return (
          <li key={brique_id}>
            <button
              type="button"
              className={classes}
              data-kind={NATURES[brique.nature]}
              aria-disabled={indisponible !== null}
              aria-label={
                epuisee
                  ? `${nom} : épuisée. Revient dans les plis`
                  : disponibles <= 0
                    ? `${nom} : tous vos exemplaires sont sur la table`
                    : `Poser ${nom} sur la table. ${exemplaires(disponibles)}`
              }
              draggable={indisponible === null}
              onDragStart={(e) => {
                e.dataTransfer.setData(TYPE_GLISSE, brique_id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => (indisponible === null ? onAjouter(brique_id) : onIndisponible(indisponible))}
            >
              <ContenuBrique brique={brique} />
              <span className={epuisee ? 'b-count zero' : 'b-count'} aria-hidden="true">
                {epuisee ? 'épuisée' : `×${Math.max(disponibles, 0)}`}
              </span>
              {consommees.includes(brique_id) && (
                <span className="b-minus" aria-hidden="true">
                  −1
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

import { useState } from 'react'

import type { Exemplaires } from '../contrat'
import type { BriqueJeu } from '../services/jeu'
import { Reserve } from './Reserve'
import { useDialogue } from './useDialogue'

interface Props {
  reserve: Exemplaires[]
  briques: Map<string, BriqueJeu>
  /** Briques posées, sans les cases vides. */
  table: string[]
  consommees: string[]
  /** Exemplaires disponibles, pour le titre. */
  exemplaires: number
  /** Case visée ; `null` : la case vide la plus à gauche. */
  rang: number | null
  tableComplete: boolean
  onPoser: (brique: string, rang: number) => void
  onAjouter: (brique: string) => void
  onFermer: () => void
}

/** Réserve en modale (App#9) : on y choisit une brique, elle se pose et la modale se ferme. */
export function ReserveModale({ reserve, briques, table, consommees, exemplaires, rang, tableComplete, onPoser, onAjouter, onFermer }: Props) {
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer)
  // Le message reste dans la modale : un message de la table s'afficherait derrière le voile.
  const [message, setMessage] = useState<string | null>(null)

  const choisir = (brique: string) => {
    if (rang === null && tableComplete) {
      setMessage('La table est pleine. Retirez une brique pour en poser une autre.')
      return
    }
    if (rang === null) onAjouter(brique)
    else onPoser(brique, rang)
    fermer()
  }

  return (
    <div className="scrim" onClick={fermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue feuille reserve-modale" role="dialog" aria-modal="true" aria-labelledby="reserve-titre" onClick={(e) => e.stopPropagation()}>
        <div className="rangee rangee-ecartee">
          <h2 id="reserve-titre" className="jk-title">
            Réserve · {exemplaires} exemplaire{exemplaires > 1 ? 's' : ''}
          </h2>
          <button type="button" data-focus-initial className="btn btn-secondary" onClick={fermer}>
            Fermer
          </button>
        </div>
        {message && (
          <p className="pk-note" role="status">
            {message}
          </p>
        )}
        <Reserve reserve={reserve} briques={briques} table={table} consommees={consommees} onAjouter={choisir} onIndisponible={setMessage} />
      </section>
    </div>
  )
}

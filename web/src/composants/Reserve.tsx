import { useEffect, useMemo, useRef, useState } from 'react'

import type { Exemplaires } from '../contrat'
import type { BriqueJeu } from '../services/jeu'
import { NATURES } from '../services/jeu'
import { ContenuBrique } from './Brique'

export const TYPE_GLISSE = 'application/x-etymo-brique'

type Filtre = 'tout' | 'prefixe' | 'suffixe' | 'recentes'

/** Briques obtenues depuis moins de 24 h : le filtre « Récentes ». */
const RECENTE_MS = 24 * 60 * 60 * 1000

interface Props {
  reserve: Exemplaires[]
  briques: Map<string, BriqueJeu>
  table: string[]
  /** Brique sélectionnée (anneau Corail), en attente d'« Ajouter à la table ». */
  selection: string | null
  onSelectionner: (brique: string | null) => void
  onAjouter: (brique: string) => void
  /** Message affiché quand on touche une brique indisponible, sans secousse. */
  onIndisponible: (message: string) => void
  /** Briques qui viennent d'être consommées : un « −1 » s'envole au-dessus. */
  consommees?: string[]
}

/** Sans accents ni casse, pour chercher « geo » comme « géo- ». */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function exemplaires(n: number): string {
  return `${n} exemplaire${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}`
}

/**
 * Réserve (maquette I-09) : recherche par brique ou par sens, filtres, tri
 * par briques récentes. Toucher sélectionne une brique, « Ajouter à la table »
 * ou Entrée la pose ; on peut aussi la glisser sur un emplacement.
 */
export function Reserve({ reserve, briques, table, selection, onSelectionner, onAjouter, onIndisponible, consommees = [] }: Props) {
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('tout')
  const champ = useRef<HTMLInputElement>(null)
  const [maintenant] = useState(() => Date.now())

  // « / » place le curseur dans la recherche (maquette ordinateur).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null
      if (e.key === '/' && cible?.tagName !== 'INPUT') {
        e.preventDefault()
        champ.current?.focus()
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [])

  const connues = useMemo(
    () =>
      reserve
        .filter((e) => briques.has(e.brique_id))
        .sort((a, b) => Date.parse(b.connue_le) - Date.parse(a.connue_le) || a.brique_id.localeCompare(b.brique_id)),
    [reserve, briques],
  )
  const correspond = (e: Exemplaires, f: Filtre) => {
    const b = briques.get(e.brique_id) as BriqueJeu
    if (f === 'prefixe' || f === 'suffixe') return b.nature === f
    if (f === 'recentes') return maintenant - Date.parse(e.connue_le) < RECENTE_MS
    return true
  }
  const cherchee = normaliser(recherche.trim())
  const visibles = connues.filter((e) => {
    const b = briques.get(e.brique_id) as BriqueJeu
    const texte = normaliser(`${b.libelle} ${b.glose ?? ''}`)
    return correspond(e, filtre) && (cherchee === '' || texte.includes(cherchee))
  })

  const disponibles = (id: string) => (reserve.find((e) => e.brique_id === id)?.exemplaires ?? 0) - table.filter((b) => b === id).length

  return (
    <>
      <label className="champ">
        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <span className="sr-only">Chercher une brique ou un sens</span>
        <input
          ref={champ}
          type="search"
          placeholder="Chercher une brique ou un sens"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <kbd aria-hidden="true">/</kbd>
      </label>
      <div className="filtres" role="group" aria-label="Filtrer la réserve">
        {(
          [
            ['tout', 'Tout', null],
            ['prefixe', 'Préfixes', 'var(--c-prefix)'],
            ['suffixe', 'Suffixes', 'var(--c-suffix)'],
            ['recentes', 'Récentes', null],
          ] as [Filtre, string, string | null][]
        ).map(([f, libelle, couleur]) => (
          <button
            key={f}
            type="button"
            className="cb-chip"
            aria-pressed={filtre === f}
            onClick={() => setFiltre(f)}
            style={couleur ? ({ '--c': couleur } as React.CSSProperties) : undefined}
          >
            {couleur && <i />}
            <span>{libelle}</span>
            {f === 'tout' && <b>{connues.length}</b>}
          </button>
        ))}
      </div>

      {connues.length === 0 ? (
        <p className="panel-tip">Votre réserve est vide pour le moment.</p>
      ) : visibles.length === 0 ? (
        <p className="panel-tip">Aucune brique ne correspond. Essayez un sens, comme « vie » ou « terre ».</p>
      ) : (
        <ul className="tray" aria-label="Briques de la réserve">
          {visibles.map(({ brique_id, exemplaires: possedes }) => {
            const brique = briques.get(brique_id) as BriqueJeu
            const libres = disponibles(brique_id)
            const epuisee = possedes === 0
            const indisponible = epuisee
              ? `Plus aucun exemplaire de ${brique.libelle}. Ouvrez un pli pour en retrouver.`
              : libres <= 0
                ? `Tous vos exemplaires de ${brique.libelle} sont déjà sur la table.`
                : null
            const nom = `${brique.libelle}${brique.glose ? ` (${brique.glose})` : ''}`
            const choisie = selection === brique_id
            const classes = ['brick', epuisee ? 'is-spent' : libres <= 0 ? 'is-out' : '', choisie ? 'sel' : ''].filter(Boolean).join(' ')
            return (
              <li key={brique_id}>
                <button
                  type="button"
                  className={classes}
                  data-kind={NATURES[brique.nature]}
                  aria-disabled={indisponible !== null}
                  aria-pressed={choisie}
                  aria-label={
                    epuisee
                      ? `${nom} : épuisée. Revient dans les plis`
                      : libres <= 0
                        ? `${nom} : tous vos exemplaires sont sur la table`
                        : `${nom}. ${exemplaires(libres)}`
                  }
                  draggable={indisponible === null}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TYPE_GLISSE, brique_id)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => {
                    if (indisponible !== null) onIndisponible(indisponible)
                    else onSelectionner(choisie ? null : brique_id)
                  }}
                  onDoubleClick={() => indisponible === null && onAjouter(brique_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && indisponible === null) {
                      e.preventDefault()
                      onAjouter(brique_id)
                    }
                  }}
                >
                  <ContenuBrique brique={brique} />
                  <span className={epuisee ? 'b-count zero' : 'b-count'} aria-hidden="true">
                    {epuisee ? 'épuisée' : `×${Math.max(libres, 0)}`}
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
      )}
    </>
  )
}

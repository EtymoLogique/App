import type { Onglet } from '../services/route'
import { Icone, type NomIcone } from './Icone'

export type { Onglet }

const ONGLETS: { id: Onglet; libelle: string; icone: NomIcone }[] = [
  { id: 'table', libelle: 'Table', icone: 'table' },
  { id: 'plis', libelle: 'Plis', icone: 'pli' },
  { id: 'codex', libelle: 'Codex', icone: 'codex' },
  { id: 'reglages', libelle: 'Réglages', icone: 'reglages' },
]

interface Props {
  actif: Onglet
  /** Nouveautés à signaler par un compteur Corail, par destination. */
  compteurs: Partial<Record<Onglet, number>>
  onChoisir: (onglet: Onglet) => void
}

/**
 * Navigation principale (design système 4.1) : quatre destinations, dans cet
 * ordre. Barre d'onglets en bas sur mobile, rail vertical au-delà de 1 100 px.
 */
export function Navigation({ actif, compteurs, onChoisir }: Props) {
  return (
    <nav className="navigation" aria-label="Navigation principale">
      <span className="seal navigation-sceau" aria-hidden="true">
        ÉL
      </span>
      {ONGLETS.map(({ id, libelle, icone }) => {
        const n = compteurs[id] ?? 0
        return (
          <button
            key={id}
            type="button"
            className={id === actif ? 'on' : undefined}
            data-onglet={id}
            aria-current={id === actif ? 'page' : undefined}
            onClick={() => onChoisir(id)}
          >
            <Icone nom={icone} />
            {libelle}
            {n > 0 && (
              <span className="count" aria-label={id === 'plis' ? `${n} pli${n > 1 ? 's' : ''} prêt${n > 1 ? 's' : ''}` : `${n} nouveauté${n > 1 ? 's' : ''}`}>
                {n}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

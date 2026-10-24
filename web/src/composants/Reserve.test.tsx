import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GEO, LOGIE, ex, jeu } from '../test/fixtures'
import { Reserve } from './Reserve'

describe('Reserve, mémoire des essais', () => {
  const { briques } = jeu()
  const reserve = [ex(GEO, 2), ex(LOGIE, 1)]

  it('range à la fin, grisées, les briques déjà essayées avec celle de la table, et les laisse jouables', () => {
    render(
      <Reserve
        reserve={reserve}
        briques={briques}
        table={[GEO]}
        memoire={{ posee: GEO, raison: (b) => (b === GEO ? 'aucune recette' : null) }}
        onAjouter={() => {}}
        onIndisponible={() => {}}
      />,
    )
    const principale = screen.getByRole('list', { name: 'Briques de la réserve' })
    const essayees = screen.getByRole('list', { name: 'Briques déjà essayées avec celle de la table' })
    expect(within(principale).getByRole('button', { name: /-logie/ })).toBeInTheDocument()
    const geo = within(essayees).getByRole('button', { name: /géo-/ })
    expect(geo).toHaveClass('is-essayee')
    expect(geo).toHaveTextContent('aucune recette')
    expect(geo).toHaveAttribute('aria-disabled', 'false')
    expect(screen.getByText(/Déjà essayées avec/)).toHaveTextContent('· 1')
  })

  it('ne trie rien sans brique sur la table', () => {
    render(<Reserve reserve={reserve} briques={briques} table={[]} onAjouter={() => {}} onIndisponible={() => {}} />)
    expect(screen.queryByText(/Déjà essayées/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(1)
  })
})

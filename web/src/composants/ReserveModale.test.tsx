import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { GEO, LOGIE, ex, jeu } from '../test/fixtures'
import { ReserveModale } from './ReserveModale'

describe('ReserveModale, mémoire des essais', () => {
  const { briques } = jeu()

  function Table() {
    const [cases, setCases] = useState<(string | null)[]>([GEO, null])
    return (
      <ReserveModale
        reserve={[ex(GEO, 2), ex(LOGIE, 1)]}
        briques={briques}
        cases={cases}
        consommees={[]}
        exemplaires={3}
        rang={null}
        onPoser={(b, i) => setCases((c) => c.map((x, j) => (j === i ? b : x)))}
        onRetirer={(i) => setCases((c) => c.map((x, j) => (j === i ? null : x)))}
        onComplete={() => {}}
        onFermer={() => {}}
        raisonEssai={([, droite]) => (droite === GEO ? 'aucune recette' : null)}
      />
    )
  }

  it('garde les briques déjà essayées à part jusqu’à la fermeture, une fois la table complète', () => {
    render(<Table />)
    expect(screen.getByText(/Déjà essayées avec/)).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('list', { name: 'Briques de la réserve' })).getByRole('button', { name: /-logie/ }))
    // Pause avant le vol : la liste ne doit pas repasser à toutes les briques.
    expect(screen.getByText('La table est prête')).toBeInTheDocument()
    const essayees = screen.getByRole('list', { name: 'Briques déjà essayées avec celle de la table' })
    expect(within(essayees).getByRole('button', { name: /géo-/ })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Briques de la réserve' })).getByRole('button', { name: /-logie/ })).toBeInTheDocument()
  })
})

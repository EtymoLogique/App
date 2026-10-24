import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { EntreeCodex } from '../services/codex'
import type { Enquete } from '../services/indices'
import { Enquetes } from './Enquetes'

const lireMedia = () => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"/>')

function enquete(n: number, obtenus: Enquete['obtenus']): Enquete {
  const entree = { id: `m${n}`, n, type: 'mot', libelle: 'géologie', resultat: true, trouvee: false, legendaire: false } as EntreeCodex
  return { entree, recette: { id: `r${n}`, motId: entree.id, emplacements: [] }, obtenus }
}

describe('Enquetes', () => {
  it('ne montre rien sans enquête', () => {
    const { container } = render(<Enquetes enquetes={[]} lireMedia={lireMedia} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('résume les indices obtenus, sans jamais nommer le mot ni proposer d’achat', () => {
    render(
      <Enquetes
        enquetes={[enquete(11, [{ niveau: 1, titre: 'Silhouette', contenu: { silhouette: 'a/x.svg' } }, { niveau: 3, titre: 'Définition', contenu: { texte: 'Science de la Terre.' } }])]}
        lireMedia={lireMedia}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Enquête en cours' })).toBeInTheDocument()
    expect(screen.getByText('N° 011')).toBeInTheDocument()
    expect(screen.getByText(/Silhouette, définition/)).toBeInTheDocument()
    expect(screen.queryByText(/géologie/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('replie au-delà de trois enquêtes', () => {
    const liste = [1, 2, 3, 4].map((n) => enquete(n, [{ niveau: 2, titre: 'Sens littéral', contenu: { texte: 'étude de la terre' } }]))
    render(<Enquetes enquetes={liste} lireMedia={lireMedia} />)
    expect(screen.getAllByText(/^N° 00/)).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Voir les 4 enquêtes' }))
    expect(screen.getAllByText(/^N° 00/)).toHaveLength(4)
  })
})

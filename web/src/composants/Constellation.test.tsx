import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { EntreeCodex } from '../services/codex'
import type { BriqueJeu, CatalogueJeu } from '../services/jeu'
import { Constellation } from './Constellation'

const brique = (id: string, nature: BriqueJeu['nature'], libelle: string): BriqueJeu =>
  ({ id, uniteId: `u_${id}`, nature, forme: libelle, libelle, rarete: 'commune', glose: 'sens', langue: null, origine: null }) as BriqueJeu
const jeu = {
  fascicules: [
    { numero: 1, manifeste: { id: 'fsc_1', nom: 'Rosette' } },
    { numero: 2, manifeste: { id: 'fsc_2', nom: 'Argile' } },
  ],
  briques: new Map([brique('geo', 'prefixe', 'géo-'), brique('bio', 'prefixe', 'bio-'), brique('logie', 'suffixe', '-logie')].map((b) => [b.id, b])),
  recettes: [
    { id: 'r1', motId: 'geologie', emplacements: [['geo'], ['logie']] },
    { id: 'r2', motId: 'biologie', emplacements: [['bio'], ['logie']] },
  ],
} as unknown as CatalogueJeu
const entrees = [
  { id: 'geologie', fascicule: 1, type: 'mot', libelle: 'géologie', trouvee: true, trouveeLe: '2026-10-01T08:00:00Z', legendaire: false },
  { id: 'biologie', fascicule: 1, type: 'mot', libelle: 'biologie', trouvee: false, trouveeLe: null, legendaire: false },
  { id: 'u_geo', fascicule: 1, type: 'prefixe', libelle: 'géo-', trouvee: true, legendaire: false },
  { id: 'u_bio', fascicule: 1, type: 'prefixe', libelle: 'bio-', trouvee: false, legendaire: false },
  { id: 'u_logie', fascicule: 1, type: 'suffixe', libelle: '-logie', trouvee: true, legendaire: false },
] as unknown as EntreeCodex[]

describe('Constellation', () => {
  it('ne montre que les briques trouvées des fascicules débloqués, et suit une famille', () => {
    render(<Constellation jeu={jeu} entrees={entrees} debloques={new Set([1])} onOuvrir={() => {}} />)
    expect(screen.getByRole('button', { name: /^1.·.Rosette$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /^2.·.Argile$/ })).not.toBeInTheDocument()
    expect(screen.getByText(/1 sur 2\s+mots dans Rosette/)).toBeInTheDocument()
    expect(screen.queryByText('bio-')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^-logie/ }))
    expect(screen.getByRole('region', { name: 'Famille suivie' })).toHaveTextContent('1 mot formé sur 2')
  })

  it('offre une liste en repli, qui ouvre la carte d’un mot', () => {
    const ouverts: string[] = []
    render(<Constellation jeu={jeu} entrees={entrees} debloques={new Set([1])} onOuvrir={(id) => ouverts.push(id)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Liste' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'géologie' })[0]!)
    expect(ouverts).toEqual(['geologie'])
  })
})

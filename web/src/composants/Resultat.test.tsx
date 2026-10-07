import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MOT, RECETTE, jeu } from '../test/fixtures'
import { Resultat, type Retour } from './Resultat'

const JALON = 'jal_0000000a'
const retour: Retour = {
  etat: 'confirme',
  issue: { type: 'decouverte', mot_id: MOT, recette_id: RECETTE, numero: 1, gouttes: 3 } as never,
  jalons: [JALON],
}

function afficher(aRecuperer: string[]) {
  render(<Resultat retour={retour} jeu={jeu()} posees={0} bloquee={null} onInverser={() => {}} aRecuperer={new Set(aRecuperer)} onQuetes={() => {}} />)
}

describe('Resultat, jalon atteint', () => {
  it('propose la récompense tant qu’elle attend', () => {
    afficher([JALON])
    expect(screen.getByRole('button', { name: 'Récupérer la récompense' })).toBeInTheDocument()
  })

  it('retire le message une fois la récompense récupérée', () => {
    afficher([])
    expect(screen.queryByText(/Jalon atteint/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Récupérer la récompense' })).not.toBeInTheDocument()
  })
})

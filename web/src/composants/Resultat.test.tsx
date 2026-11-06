import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MOT, RECETTE, jeu } from '../test/fixtures'
import { Resultat, type Retour } from './Resultat'

const JALON = 'jal_0000000a'
const retour: Retour = {
  etat: 'confirme',
  issue: { type: 'decouverte', mot_id: MOT, recette_id: RECETTE, numero: 1, gouttes: 3 } as never,
  jalons: [JALON],
}

function afficher(aRecuperer: string[], suite: Retour = retour, onFascicule: (id: string) => void = () => {}) {
  render(<Resultat retour={suite} jeu={jeu()} posees={0} bloquee={null} onInverser={() => {}} aRecuperer={new Set(aRecuperer)} onQuetes={() => {}} onFascicule={onFascicule} />)
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

describe('Resultat, fascicule débloqué (ADR 0068)', () => {
  it('annonce le fascicule ouvert et mène à son pli', () => {
    const fascicule = jeu().fascicules[0]
    const id = fascicule?.manifeste.id ?? ''
    const ouvrir = vi.fn()
    afficher([], { ...retour, jalons: [], fascicules: [id] }, ouvrir)
    expect(screen.getByText(/Nouveau fascicule ouvert/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir son pli' }))
    expect(ouvrir).toHaveBeenCalledWith(id)
  })

  it('ne dit rien sans déblocage', () => {
    afficher([])
    expect(screen.queryByText(/Nouveau fascicule ouvert/)).not.toBeInTheDocument()
  })
})

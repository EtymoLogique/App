import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CompteReglages } from './CompteReglages'

const actions = () => ({
  onSauvegarder: vi.fn(),
  onSeConnecter: vi.fn(),
  changerPseudo: vi.fn().mockResolvedValue(null),
  deconnecter: vi.fn().mockResolvedValue(null),
  supprimer: vi.fn().mockResolvedValue(null),
})

describe('compte dans les Réglages (I-33)', () => {
  it('en invité : « Sauvegarder ma progression » et « J’ai déjà un compte »', () => {
    const a = actions()
    render(<CompteReglages compte={undefined} enLigne {...a} />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder ma progression/ }))
    expect(a.onSauvegarder).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /J’ai déjà un compte/ }))
    expect(a.onSeConnecter).toHaveBeenCalled()
    expect(screen.queryByText('Se déconnecter')).toBeNull()
  })

  it('en invité : « Effacer ma partie » exige SUPPRIMER', () => {
    const a = actions()
    render(<CompteReglages compte={undefined} enLigne {...a} />)
    fireEvent.click(screen.getByRole('button', { name: 'Effacer ma partie' }))
    expect(screen.getByText('Effacer votre partie ?')).toBeInTheDocument()
    const supprimer = screen.getByRole('button', { name: 'Supprimer' })
    expect(supprimer).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Tapez SUPPRIMER pour confirmer'), { target: { value: 'SUPPRIMER' } })
    fireEvent.click(supprimer)
    expect(a.supprimer).toHaveBeenCalled()
  })

  it('annonce l’effacement d’un compte inactif depuis 3 ans (ADR 0071)', () => {
    render(<CompteReglages compte={{ pseudo: 'camille-4821', pseudo_confirme: true }} enLigne {...actions()} />)
    expect(screen.getByText('Un compte inactif depuis 3 ans est effacé.')).toBeInTheDocument()
  })

  it('le pseudo par défaut est marqué « Privé » ; la suppression exige SUPPRIMER', () => {
    const a = actions()
    render(<CompteReglages compte={{ pseudo: 'camille-4821', pseudo_confirme: false }} enLigne {...a} />)
    expect(screen.getByText('camille-4821')).toBeInTheDocument()
    expect(screen.getByText('Privé')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer mon compte' }))
    const supprimer = screen.getByRole('button', { name: 'Supprimer' })
    expect(supprimer).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
    fireEvent.change(screen.getByLabelText('Tapez SUPPRIMER pour confirmer'), { target: { value: 'SUPPRIMER' } })
    expect(supprimer).toBeEnabled()
    fireEvent.click(supprimer)
    expect(a.supprimer).toHaveBeenCalled()
  })

  it('un pseudo confirmé n’est plus privé', () => {
    render(<CompteReglages compte={{ pseudo: 'elodie-lit', pseudo_confirme: true }} enLigne {...actions()} />)
    expect(screen.queryByText('Privé')).toBeNull()
    expect(screen.getByRole('button', { name: /Modifier le pseudo/ })).toBeInTheDocument()
  })
})

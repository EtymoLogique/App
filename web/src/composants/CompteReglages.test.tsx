import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CompteReglages } from './CompteReglages'

const actions = () => ({
  onSauvegarder: vi.fn(),
  changerPseudo: vi.fn().mockResolvedValue(null),
  deconnecter: vi.fn().mockResolvedValue(null),
  supprimer: vi.fn().mockResolvedValue(null),
})

describe('compte dans les Réglages (I-33)', () => {
  it('en invité, une seule ligne : « Sauvegarder ma progression »', () => {
    const a = actions()
    render(<CompteReglages compte={undefined} enLigne {...a} />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder ma progression/ }))
    expect(a.onSauvegarder).toHaveBeenCalled()
    expect(screen.queryByText('Se déconnecter')).toBeNull()
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

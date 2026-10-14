import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { type ClientApi, ErreurApi } from '../services/api'
import { etat } from '../test/fixtures'
import { Connexion } from './Connexion'

const confirmation = { issue: 'compte_cree', pseudo: 'camille-4821', pseudo_confirme: false } as const

function rendu(confirmerCompte: ReturnType<typeof vi.fn>) {
  const api = {
    demandeCompte: vi.fn().mockResolvedValue({ defi: 'defi-1', renvoyer_dans_s: 60 }),
    confirmerCompte,
  } as unknown as ClientApi
  const onConfirme = vi.fn().mockResolvedValue(undefined)
  render(<Connexion api={api} etat={etat()} enLigne onConfirme={onConfirme} />)
  return { api, onConfirme }
}

async function jusquAuCode() {
  fireEvent.change(screen.getByLabelText('Adresse électronique'), { target: { value: 'camille@exemple.fr' } })
  fireEvent.click(screen.getByRole('button', { name: 'Recevoir un code' }))
  await screen.findByText('Vérifiez votre boîte de réception')
  return screen.getByLabelText('Code à 6 chiffres')
}

describe('connexion par e-mail (I-31)', () => {
  it('demande un code, puis confirme dès le 6ᵉ chiffre collé', async () => {
    const confirmer = vi.fn().mockResolvedValue(confirmation)
    const { api, onConfirme } = rendu(confirmer)
    const code = await jusquAuCode()
    expect(api.demandeCompte).toHaveBeenCalledWith({ courriel: 'camille@exemple.fr' })
    expect(screen.getByRole('button', { name: 'Renvoyer dans 1:00' })).toBeDisabled()
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    expect(code).toHaveAttribute('inputmode', 'numeric')
    await act(async () => {
      fireEvent.change(code, { target: { value: '482 913' } })
    })
    expect(confirmer).toHaveBeenCalledWith({ defi: 'defi-1', code: '482913', remplacer_invite: false })
    await waitFor(() => expect(onConfirme).toHaveBeenCalledWith(confirmation))
  })

  it('un code faux dit les essais restants', async () => {
    rendu(vi.fn().mockRejectedValue(new ErreurApi(400, 'requete_invalide', 'faux', { essais_restants: 3 })))
    const code = await jusquAuCode()
    await act(async () => {
      fireEvent.change(code, { target: { value: '000000' } })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce code ne correspond pas. Il vous reste 3 essais.')
  })

  it('un code expiré demande un nouveau code', async () => {
    rendu(vi.fn().mockRejectedValue(new ErreurApi(410, 'expire', 'expiré')))
    const code = await jusquAuCode()
    await act(async () => {
      fireEvent.change(code, { target: { value: '123456' } })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Demandez un nouveau code.')
  })

  it('prévient avant de remplacer une partie invitée, « Annuler » par défaut', async () => {
    const confirmer = vi
      .fn()
      .mockRejectedValueOnce(new ErreurApi(409, 'conflit', 'partie', { avertissement: { decouvertes: 5, gouttes: 23 } }))
      .mockResolvedValueOnce({ ...confirmation, issue: 'connecte' })
    const { onConfirme } = rendu(confirmer)
    const code = await jusquAuCode()
    await act(async () => {
      fireEvent.change(code, { target: { value: '123456' } })
    })
    const dialogue = await screen.findByRole('alertdialog', { name: 'Remplacer la partie de cet appareil ?' })
    expect(dialogue).toHaveTextContent('5 mots trouvés, 23 gouttes')
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir mon compte' }))
    })
    expect(confirmer).toHaveBeenLastCalledWith({ defi: 'defi-1', code: '123456', remplacer_invite: true })
    await waitFor(() => expect(onConfirme).toHaveBeenCalled())
  })
})

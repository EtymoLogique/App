import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Etat } from '../contrat'
import { etat as fixture } from '../test/fixtures'
import { RaccourciSabliers } from './Sabliers'

/** Une charge sur deux : le temps court, le raccourci s'affiche. */
const etat = (encre: number, detenus: number): Etat =>
  fixture({
    encre,
    sabliers: { detenus, prix_gouttes: 10 },
    energie: { capacite: 2, charges: 1, recharge_s: 43_200, prochaine_charge: new Date(Date.now() + 3_600_000).toISOString() },
  })

const rendu = (e: Etat, acheter = vi.fn().mockResolvedValue({ etat: e })) => {
  render(<RaccourciSabliers etat={e} utiliser={vi.fn()} acheter={acheter} />)
  return acheter
}

describe('raccourci des sabliers', () => {
  it('sans sablier, « Acheter des sabliers » n’affiche aucun prix', () => {
    rendu(etat(8850, 0))
    const bouton = screen.getByRole('button', { name: 'Acheter des sabliers' })
    expect(bouton.textContent).not.toMatch(/\d/)
    expect(bouton).toBeEnabled()
  })

  it('avec des sabliers, garde « Avancer »', () => {
    rendu(etat(8850, 3))
    expect(screen.getByRole('button', { name: /Faire avancer le temps/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Acheter des sabliers' })).toBeNull()
  })

  it('propose les trois lots de la boutique et désactive ceux que l’encre ne couvre pas', () => {
    rendu(etat(35, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Acheter des sabliers' }))
    const feuille = screen.getByRole('dialog')
    expect(within(feuille).getByRole('button', { name: 'Un sablier contre 10 gouttes' })).toBeEnabled()
    expect(within(feuille).getByRole('button', { name: 'Trois sabliers contre 30 gouttes' })).toBeEnabled()
    expect(within(feuille).getByRole('button', { name: 'Douze sabliers contre 120 gouttes' })).toBeDisabled()
    expect(within(feuille).getByText('Il vous manque 85 gouttes.')).toBeInTheDocument()
  })

  it('un clic sur un lot échange et avance aussitôt, sans second clic', async () => {
    const acheter = rendu(etat(8850, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Acheter des sabliers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trois sabliers contre 30 gouttes' }))
    await waitFor(() => expect(acheter).toHaveBeenCalledWith(3))
    expect(acheter).toHaveBeenCalledTimes(1)
  })

  it('une erreur reste affichée et la feuille reste ouverte', async () => {
    rendu(etat(8850, 0), vi.fn().mockResolvedValue({ erreur: 'Pas assez d’encre pour cet échange.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Acheter des sabliers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Un sablier contre 10 gouttes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Pas assez d’encre pour cet échange.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('« Annuler » et l’action d’une feuille sont sur une même ligne, à droite, dans cet ordre', () => {
    rendu(etat(8850, 3))
    fireEvent.click(screen.getByRole('button', { name: /Faire avancer le temps/ }))
    const annuler = screen.getByRole('button', { name: 'Annuler' })
    const rangee = annuler.parentElement as HTMLElement
    expect(rangee).toHaveClass('rangee-fin', 'rangee-actions')
    expect(Array.from(rangee.children).map((b) => b.textContent)).toEqual(['Annuler', expect.stringMatching(/^Utiliser \d+ sablier/)])
  })
})

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DonneesRicochets } from '../services/ricochets'
import { GEO, LOGIE, jeu } from '../test/fixtures'
import { Paires } from './Ricochets'

const d: DonneesRicochets = {
  briques: new Map([
    [GEO, { sens: 'sns_1', classe: 'sns_1', position: 'prefixe' as const }],
    [LOGIE, { sens: 'sns_2', classe: 'sns_2', position: 'suffixe' as const }],
  ]),
  mots: new Map(),
  gloses: new Map([
    ['sns_1', 'terre'],
    ['sns_2', 'étude'],
  ]),
}

function monter() {
  const envoyer = vi.fn()
  const repondu = vi.fn()
  render(<Paires q={{ format: 'paires', cartes: [GEO, LOGIE] }} jeu={jeu()} d={d} envoyer={envoyer} repondu={repondu} />)
  return { envoyer, repondu }
}

const brique = (rang: number) => within(screen.getByRole('group', { name: 'Briques' })).getAllByRole('button')[rang] as HTMLButtonElement
const sens = (glose: string) => within(screen.getByRole('group', { name: 'Sens' })).getByRole('button', { name: new RegExp(glose) })

describe('Paires', () => {
  it('la dernière paire reliée envoie les réponses, sans étape « Valider »', () => {
    const { envoyer, repondu } = monter()
    expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull()
    fireEvent.click(brique(0))
    fireEvent.click(sens('terre'))
    expect(envoyer).not.toHaveBeenCalled()
    // Dans l'autre ordre : le sens d'abord, la brique ensuite.
    fireEvent.click(sens('étude'))
    fireEvent.click(brique(1))
    expect(envoyer).toHaveBeenCalledTimes(2)
    expect(envoyer).toHaveBeenCalledWith('paires', GEO, 'sns_1')
    expect(envoyer).toHaveBeenCalledWith('paires', LOGIE, 'sns_2')
    expect(repondu).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Toutes les paires sont justes.')).toBeInTheDocument()
    expect(brique(0)).toBeDisabled()
  })

  it('un sens repris par une autre brique ne valide rien tant qu’une brique reste seule', () => {
    const { envoyer } = monter()
    fireEvent.click(brique(0))
    fireEvent.click(sens('étude'))
    // Le sens passe à l'autre brique : la première se retrouve seule.
    fireEvent.click(brique(1))
    fireEvent.click(sens('étude'))
    expect(envoyer).not.toHaveBeenCalled()
    fireEvent.click(brique(0))
    fireEvent.click(sens('terre'))
    expect(envoyer).toHaveBeenCalledTimes(2)
    expect(envoyer).toHaveBeenCalledWith('paires', GEO, 'sns_1')
    expect(envoyer).toHaveBeenCalledWith('paires', LOGIE, 'sns_2')
  })
})

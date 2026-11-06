import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DonneesRicochets } from '../services/ricochets'
import { GEO, LOGIE, MOT, jeu } from '../test/fixtures'
import { Assembler } from './Ricochets'

const d: DonneesRicochets = {
  briques: new Map([
    [GEO, { sens: 'sns_1', classe: 'sns_1', position: 'prefixe' as const }],
    [LOGIE, { sens: 'sns_2', classe: 'sns_2', position: 'suffixe' as const }],
  ]),
  mots: new Map([[MOT, { classe: MOT, coupes: [3], assemblage: [GEO, LOGIE] }]]),
  gloses: new Map(),
}

function monter() {
  const envoyer = vi.fn()
  const repondu = vi.fn()
  render(<Assembler q={{ format: 'assembler', cartes: [MOT], choix: [GEO, LOGIE] }} jeu={jeu()} d={d} envoyer={envoyer} repondu={repondu} />)
  return { envoyer, repondu }
}

const colonne = (nom: string) => screen.getByRole('group', { name: nom }).querySelector('button') as HTMLButtonElement

describe('Assembler', () => {
  it('la seconde brique posée envoie la réponse, sans étape « Valider »', () => {
    const { envoyer, repondu } = monter()
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull()
    fireEvent.click(colonne('Préfixes'))
    expect(envoyer).not.toHaveBeenCalled()
    fireEvent.click(colonne('Suffixes'))
    expect(envoyer).toHaveBeenCalledExactlyOnceWith('assembler', MOT, [GEO, LOGIE])
    expect(repondu).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Bien vu.')).toBeInTheDocument()
    expect(colonne('Préfixes')).toBeDisabled()
  })

  it('tant qu’une place est vide, toucher la brique posée la retire, sans rien envoyer', () => {
    const { envoyer } = monter()
    fireEvent.click(colonne('Préfixes'))
    fireEvent.click(screen.getByRole('button', { name: 'Préfixe choisi, touchez pour le retirer' }))
    expect(screen.getByRole('img', { name: 'Préfixe : pas encore choisi' })).toBeInTheDocument()
    fireEvent.click(colonne('Suffixes'))
    expect(envoyer).not.toHaveBeenCalled()
    fireEvent.click(colonne('Préfixes'))
    expect(envoyer).toHaveBeenCalledExactlyOnceWith('assembler', MOT, [GEO, LOGIE])
  })
})

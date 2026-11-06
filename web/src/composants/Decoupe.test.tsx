import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { QuestionRicochet } from '../contrat'
import type { CatalogueJeu } from '../services/jeu'
import type { DonneesRicochets, NoeudCoupes } from '../services/ricochets'
import { Decoupe } from './Ricochets'

// « abcdefghij » : abcdefgh · ij, puis abcde · fgh. Des lettres neutres, un arbre à deux niveaux.
const arbre: NoeudCoupes = { debut: 0, fin: 10, coupes: [8], parties: [{ debut: 0, fin: 8, coupes: [5] }] }
const jeu = { cartes: new Map([['unt_1', { formes: [{ role: 'canonique', texte: 'abcdefghij' }], compositions: [] }]]), recettes: [], briques: new Map() } as unknown as CatalogueJeu
const d: DonneesRicochets = { briques: new Map(), gloses: new Map(), mots: new Map([['unt_1', { classe: null, coupes: [8], decoupage: arbre }]]) }
const q: QuestionRicochet = { format: 'decouper', cartes: ['unt_1'], choix: [] }

function monter() {
  const envoyer = vi.fn()
  const repondu = vi.fn()
  render(<Decoupe q={q} jeu={jeu} d={d} envoyer={envoyer} repondu={repondu} />)
  const couper = (apres: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Couper entre « ${apres} »`) }))
  return { envoyer, repondu, couper }
}

// jsdom ne défile pas.
Element.prototype.scrollIntoView = vi.fn()

describe('Découper en chaîne', () => {
  it('chaque coupe juste part au serveur ; la question reste ouverte jusqu’à la dernière', () => {
    const { envoyer, repondu, couper } = monter()
    couper('abcdefgh')
    expect(envoyer).toHaveBeenLastCalledWith('decouper', 'unt_1', [8])
    expect(repondu).not.toHaveBeenCalled()
    expect(screen.getByText('Un morceau se coupe encore.')).toBeInTheDocument()
    couper('abcde')
    expect(envoyer).toHaveBeenLastCalledWith('decouper', 'unt_1', [5, 8])
    expect(envoyer).toHaveBeenCalledTimes(2)
    expect(repondu).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Bien vu.')).toBeInTheDocument()
  })

  it('une coupe fausse arrête la question, même après une coupe juste', () => {
    const { envoyer, repondu, couper } = monter()
    couper('abcdefgh')
    couper('abc')
    expect(envoyer).toHaveBeenLastCalledWith('decouper', 'unt_1', [3, 8])
    expect(repondu).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Pas cette fois.')).toBeInTheDocument()
  })

  it('le sous-niveau avant son morceau est faux', () => {
    const { repondu, couper } = monter()
    couper('abcde')
    expect(repondu).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Pas cette fois.')).toBeInTheDocument()
  })

  it('une coupe déjà posée ne se renvoie pas', () => {
    const { envoyer, couper } = monter()
    couper('abcdefgh')
    couper('abcdefgh')
    expect(envoyer).toHaveBeenCalledTimes(1)
  })
})

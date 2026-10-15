import { describe, expect, it } from 'vitest'

import type { Etat } from '../contrat'
import { SOUVENIR_SOUTIEN_VIERGE, ajouterTempsDeJeu, carteMasquee, doitSolliciter, fermerSoutien, lireSouvenirSoutien, masquerCarte } from './soutien'

const JOUR = 86_400_000
const etat = (soutien?: boolean) =>
  ({ compte: soutien === undefined ? null : { pseudo: 'a', pseudo_confirme: true, soutien } }) as unknown as Etat
const joue = (minutes: number) => ajouterTempsDeJeu(SOUVENIR_SOUTIEN_VIERGE, minutes * 60)

describe('doitSolliciter', () => {
  it('attend 15 minutes de jeu', () => {
    expect(doitSolliciter(etat(), joue(14))).toBe(false)
    expect(doitSolliciter(etat(), joue(15))).toBe(true)
  })
  it('ne revient qu\'après 7 jours', () => {
    const vu = fermerSoutien(joue(40), 1000)
    expect(doitSolliciter(etat(), vu, 1000 + 7 * JOUR - 1)).toBe(false)
    expect(doitSolliciter(etat(), vu, 1000 + 7 * JOUR)).toBe(true)
  })
  it('épargne les abonnés, pas les comptes sans abonnement', () => {
    expect(doitSolliciter(etat(true), joue(60))).toBe(false)
    expect(doitSolliciter(etat(false), joue(60))).toBe(true)
  })
})

describe('carteMasquee', () => {
  it('revient après 30 jours, sans toucher à la modale', () => {
    const masquee = masquerCarte(SOUVENIR_SOUTIEN_VIERGE, 1000)
    expect(carteMasquee(masquee, 1000 + 29 * JOUR)).toBe(true)
    expect(carteMasquee(masquee, 1000 + 30 * JOUR)).toBe(false)
    expect(carteMasquee(SOUVENIR_SOUTIEN_VIERGE)).toBe(false)
    expect(fermerSoutien(masquee, 5).carte_masquee_le).toBe(1000)
  })
})

describe('lireSouvenirSoutien', () => {
  it('repart du vierge pour une valeur absente, ancienne ou abîmée', () => {
    expect(lireSouvenirSoutien(undefined)).toEqual(SOUVENIR_SOUTIEN_VIERGE)
    expect(lireSouvenirSoutien({ fermee_le_jour_de_jeu: 4 })).toEqual(SOUVENIR_SOUTIEN_VIERGE)
    expect(lireSouvenirSoutien({ temps_de_jeu_s: -3, fermee_le: 'x' })).toEqual(SOUVENIR_SOUTIEN_VIERGE)
    expect(lireSouvenirSoutien({ temps_de_jeu_s: 90, fermee_le: 7, carte_masquee_le: null })).toEqual({ temps_de_jeu_s: 90, fermee_le: 7, carte_masquee_le: null })
  })
})

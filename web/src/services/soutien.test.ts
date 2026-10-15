import { describe, expect, it } from 'vitest'

import type { Etat } from '../contrat'
import { SOUVENIR_SOUTIEN_VIERGE, carteMasquee, doitSolliciter, fermerSoutien, masquerCarte } from './soutien'

const etat = (decouvertes: number, jours: number, soutien?: boolean) =>
  ({ decouvertes: Array.from({ length: decouvertes }), jours_de_jeu: jours, compte: soutien === undefined ? null : { pseudo: 'a', pseudo_confirme: true, soutien } }) as unknown as Etat

describe('doitSolliciter', () => {
  it('attend 5 découvertes et 3 jours de jeu', () => {
    expect(doitSolliciter(etat(4, 9), SOUVENIR_SOUTIEN_VIERGE)).toBe(false)
    expect(doitSolliciter(etat(5, 2), SOUVENIR_SOUTIEN_VIERGE)).toBe(false)
    expect(doitSolliciter(etat(5, 3), SOUVENIR_SOUTIEN_VIERGE)).toBe(true)
  })
  it('ne revient qu\'après 30 jours de jeu', () => {
    const vu = fermerSoutien(etat(9, 10), SOUVENIR_SOUTIEN_VIERGE)
    expect(doitSolliciter(etat(9, 39), vu)).toBe(false)
    expect(doitSolliciter(etat(9, 40), vu)).toBe(true)
  })
  it('épargne les abonnés, pas les comptes sans abonnement', () => {
    expect(doitSolliciter(etat(9, 9, true), SOUVENIR_SOUTIEN_VIERGE)).toBe(false)
    expect(doitSolliciter(etat(9, 9, false), SOUVENIR_SOUTIEN_VIERGE)).toBe(true)
  })
})

describe('carteMasquee', () => {
  it('revient après 30 jours, sans toucher à la modale', () => {
    const jour = 86_400_000
    const masquee = masquerCarte({ fermee_le_jour_de_jeu: 4 }, 1000)
    expect(carteMasquee(masquee, 1000 + 29 * jour)).toBe(true)
    expect(carteMasquee(masquee, 1000 + 30 * jour)).toBe(false)
    expect(carteMasquee(SOUVENIR_SOUTIEN_VIERGE)).toBe(false)
    expect(fermerSoutien(etat(9, 10), masquee).carte_masquee_le).toBe(1000)
  })
})

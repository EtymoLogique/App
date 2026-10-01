import { describe, expect, it } from 'vitest'

import { energieDepuisReste, ressort } from './animation'
import { avantPlein, energieA } from './plis'

describe('energieDepuisReste', () => {
  const energie = { charges: 0, capacite: 2, prochaine_charge: '2026-10-01T12:00:00Z', recharge_s: 43_200 }
  const maintenant = Date.parse('2026-10-01T10:00:00Z')

  it('retrouve l’énergie d’origine à partir de son temps restant', () => {
    const reste = avantPlein(energie, maintenant)
    expect(energieA(energieDepuisReste(energie, reste, maintenant), maintenant)).toEqual(energieA(energie, maintenant))
  })

  it('passe une charge quand le temps restant descend sous une recharge', () => {
    const uneHeure = 3_600_000
    expect(energieA(energieDepuisReste(energie, uneHeure, maintenant), maintenant)).toEqual({ charges: 1, prochaine: maintenant + uneHeure })
    expect(energieA(energieDepuisReste(energie, 0, maintenant), maintenant)).toEqual({ charges: 2, prochaine: null })
  })
})

describe('ressort', () => {
  it('part de 0, arrive à 1, et dépasse une fois en chemin', () => {
    expect(ressort(0)).toBe(0)
    expect(ressort(1)).toBe(1)
    const max = Math.max(...Array.from({ length: 101 }, (_, i) => ressort(i / 100)))
    expect(max).toBeGreaterThan(1.02)
    expect(max).toBeLessThan(1.15)
  })
})

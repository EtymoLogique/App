import { describe, expect, it } from 'vitest'

import { manifeste } from '../test/fixtures'
import { type BriquePli, chances, duree, energieA, poids, pourcentage } from './plis'

const equilibrage = manifeste.pli!.equilibrage!
const brique = (id: string, nature: BriquePli['nature'], rarete: BriquePli['rarete']): BriquePli => ({ id, unite_id: 'unt_00000000', nature, rarete })

describe('plis', () => {
  it('répartit le poids d’une classe entre ses briques, comme le serveur', () => {
    const briques = [
      brique('brq_0000ge00', 'prefixe', 'commune'),
      brique('brq_0000b100', 'prefixe', 'commune'),
      brique('brq_000109e0', 'suffixe', 'commune'),
      brique('brq_0000000r', 'suffixe', 'rare'),
    ]
    const p = poids(briques, equilibrage)
    expect(p[0]).toBe(p[1])
    expect(p[0]! * 2 * 125).toBe(p[2]! * 100)
    expect(p[2]! * 10).toBe(p[3]! * 62)
    const c = chances(briques, equilibrage)
    expect(c.parRarete.commune + c.parRarete.rare).toBeCloseTo(1)
  })

  it('n’arrondit jamais une chance à 0 % ni à 100 %', () => {
    expect(pourcentage(0.00004)).toBe('0,01 %')
    expect(pourcentage(0.9999)).toBe('99,9 %')
    expect(pourcentage(0.059)).toBe('5,9 %')
    expect(pourcentage(0.66)).toBe('66 %')
  })

  it('rattrape les charges revenues et arrête le temps à deux', () => {
    const energie = { charges: 0, capacite: 2, prochaine_charge: '2026-10-01T12:00:00Z', recharge_s: 43_200 }
    const midi = Date.parse('2026-10-01T12:00:00Z')
    expect(energieA(energie, midi)).toEqual({ charges: 1, prochaine: midi + 43_200_000 })
    expect(energieA(energie, midi + 100_000_000)).toEqual({ charges: 2, prochaine: null })
    expect(duree(4 * 3600_000 + 21 * 60_000 + 50_000)).toBe('04:21:50')
  })
})

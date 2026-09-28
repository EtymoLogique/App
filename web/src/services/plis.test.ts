import { describe, expect, it } from 'vitest'

import { manifeste } from '../test/fixtures'
import { type BriquePli, chances, duree, dureeSablier, energieA, nombreSansPerte, perteSablier, poids, pourcentage, repartirSabliers } from './plis'

const equilibrage = manifeste.pli!.equilibrage!
const brique = (id: string, nature: BriquePli['nature'], rarete: BriquePli['rarete']): BriquePli => ({ id, unite_id: 'unt_00000000', nature, rarete })

describe('plis', () => {
  it('pondère chaque brique par sa seule rareté, comme le serveur', () => {
    const briques = [
      brique('brq_0000ge00', 'prefixe', 'commune'),
      brique('brq_0000b100', 'prefixe', 'commune'),
      brique('brq_000109e0', 'suffixe', 'commune'),
      brique('brq_0000000r', 'suffixe', 'rare'),
    ]
    expect(poids(briques, equilibrage)).toEqual([62, 62, 62, 10])
    const c = chances(briques, equilibrage)
    expect(c.parRarete.commune).toBeCloseTo(186 / 196)
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

describe('sabliers', () => {
  const maintenant = Date.parse('2026-10-01T10:00:00Z')
  // Une charge sur deux, la prochaine dans 2 h : 2 h avant l'énergie pleine.
  const energie = { charges: 1, capacite: 2, prochaine_charge: '2026-10-01T12:00:00Z', recharge_s: 43_200 }

  it('annonce le temps perdu au-delà de deux charges', () => {
    expect(dureeSablier(energie)).toBe(3_600_000)
    expect(nombreSansPerte(energie, maintenant)).toBe(2)
    expect(perteSablier(energie, 2, maintenant)).toBe(0)
    expect(perteSablier(energie, 5, maintenant)).toBe(3 * 3_600_000)
  })

  it('reporte le temps sur la charge suivante tant que l’énergie n’est pas pleine', () => {
    const vide = { ...energie, charges: 0 }
    expect(nombreSansPerte(vide, maintenant)).toBe(14)
  })

  it('prend les sabliers détenus avant l’encre, sous le plafond du jour', () => {
    expect(repartirSabliers(5, 3, 10, 0)).toEqual({ detenus: 3, encre: 2 })
    expect(repartirSabliers(5, 3, 1, 0)).toBeNull()
    expect(repartirSabliers(3, 0, 10, 10)).toBeNull()
  })
})

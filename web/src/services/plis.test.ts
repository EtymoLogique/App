import { describe, expect, it } from 'vitest'

import { manifeste } from '../test/fixtures'
import { type BriquePli, chances, duree, dureeLisible, avantPlein, dureeSablier, energieA, nombrePourRemplir, poids, pourcentage, sabliersAchetables } from './plis'

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
  it('écrit une durée en toutes lettres', () => {
    expect(dureeLisible(3 * 3600_000)).toBe('3\u00a0h')
    expect(dureeLisible(5400_000)).toBe('1\u00a0h 30\u00a0min')
    expect(dureeLisible(25_000)).toBe('25\u00a0s')
    expect(dureeLisible(8 * 3600_000 + 31 * 60_000 + 4_000)).toBe('8\u00a0h 31\u00a0min')
    expect(dureeLisible(0)).toBe('0\u00a0s')
  })

  const maintenant = Date.parse('2026-10-01T10:00:00Z')
  // Une charge sur deux, la prochaine dans 2 h : 2 h avant l'énergie pleine.
  const energie = { charges: 1, capacite: 2, prochaine_charge: '2026-10-01T12:00:00Z', recharge_s: 43_200 }

  it('compte les sabliers qui remplissent l’énergie, arrondis à l’heure supérieure', () => {
    expect(dureeSablier(energie)).toBe(3_600_000)
    expect(avantPlein(energie, maintenant)).toBe(2 * 3_600_000)
    expect(nombrePourRemplir(energie, maintenant)).toBe(2)
    // 11 h 59 avant le prochain pli : 12 sabliers, pas 11.
    expect(nombrePourRemplir({ ...energie, prochaine_charge: '2026-10-01T21:59:00Z' }, maintenant)).toBe(12)
  })

  it('reporte le temps sur la charge suivante tant que l’énergie n’est pas pleine', () => {
    const vide = { ...energie, charges: 0 }
    expect(nombrePourRemplir(vide, maintenant)).toBe(14)
  })

  it('échange selon l’encre seulement, sans plafond', () => {
    const s = { detenus: 0, prix_gouttes: 10 }
    expect(sabliersAchetables(s, 35)).toBe(3)
    expect(sabliersAchetables(s, 500)).toBe(50)
    expect(sabliersAchetables(s, 9)).toBe(0)
  })
})

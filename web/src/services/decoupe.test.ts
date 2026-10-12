import { describe, expect, it } from 'vitest'

import { jointureInitiale, jointureLaPlusProche, jointureVoisine, jointuresLibres } from './decoupe'

describe('jointuresLibres', () => {
  it('numérote de 1 à n - 1 et retire les coupes', () => {
    expect(jointuresLibres(5, [])).toEqual([1, 2, 3, 4])
    expect(jointuresLibres(5, [2, 4])).toEqual([1, 3])
    expect(jointuresLibres(1, [])).toEqual([])
    expect(jointuresLibres(0, [])).toEqual([])
  })
})

describe('jointureLaPlusProche', () => {
  // Cinq lettres de 10 px : jointures à 10, 20, 30, 40 (l'index 0 n'est pas une jointure).
  const positions = [0, 10, 20, 30, 40]
  it('se cale sur la jointure la plus proche, jamais entre deux lettres', () => {
    expect(jointureLaPlusProche(positions, 12, [])).toBe(1)
    expect(jointureLaPlusProche(positions, 26, [])).toBe(3)
    expect(jointureLaPlusProche(positions, -50, [])).toBe(1)
    expect(jointureLaPlusProche(positions, 500, [])).toBe(4)
  })
  it('saute les jointures déjà coupées', () => {
    expect(jointureLaPlusProche(positions, 21, [2])).toBe(3)
    expect(jointureLaPlusProche(positions, 21, [2, 3])).toBe(1)
  })
  it('rend null quand tout est coupé', () => {
    expect(jointureLaPlusProche(positions, 20, [1, 2, 3, 4])).toBeNull()
  })
})

describe('jointureVoisine', () => {
  it('avance et recule d’une jointure libre', () => {
    expect(jointureVoisine(2, 1, 6, [])).toBe(3)
    expect(jointureVoisine(2, -1, 6, [])).toBe(1)
  })
  it('saute les coupes et reste en place au bord', () => {
    expect(jointureVoisine(2, 1, 6, [3, 4])).toBe(5)
    expect(jointureVoisine(5, 1, 6, [])).toBe(5)
    expect(jointureVoisine(1, -1, 6, [])).toBe(1)
    expect(jointureVoisine(4, 1, 6, [5])).toBe(4)
  })
})

describe('jointureInitiale', () => {
  it('tire au hasard une jointure libre qui n’est jamais une coupe attendue', () => {
    // géographie (10 lettres), coupe attendue en 3 : les leurres sont 1, 2, 4… 9.
    expect(jointureInitiale(10, [], [3], () => 0)).toBe(1)
    expect(jointureInitiale(10, [], [3], () => 0.2)).toBe(2)
    expect(jointureInitiale(10, [], [3], () => 0.25)).toBe(4)
    expect(jointureInitiale(10, [], [3], () => 0.999)).toBe(9)
    for (let i = 0; i < 200; i++) expect(jointureInitiale(10, [], [3])).not.toBe(3)
  })
  it('couvre toutes les jointures possibles, pas seulement le milieu', () => {
    const vues = new Set(Array.from({ length: 8 }, (_, i) => jointureInitiale(10, [], [3], () => i / 8)))
    expect([...vues].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 4, 5, 6, 7, 8, 9])
  })
  it('évite les coupes posées et attendues ; faute de leurre, prend une libre', () => {
    expect(jointureInitiale(14, [4], [4, 7], () => 0)).toBe(1)
    for (let i = 0; i < 200; i++) expect([4, 7]).not.toContain(jointureInitiale(14, [4], [4, 7]))
    expect(jointureInitiale(2, [], [1])).toBe(1)
    expect(jointureInitiale(3, [1], [1, 2])).toBe(2)
    expect(jointureInitiale(1, [], [])).toBeNull()
  })
})

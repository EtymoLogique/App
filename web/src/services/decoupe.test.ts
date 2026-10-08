import { describe, expect, it } from 'vitest'

import { jointureInitiale, jointureLaPlusProche, jointureLibreProche, jointureVoisine, jointuresLibres } from './decoupe'

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

describe('jointureLibreProche et jointureInitiale', () => {
  it('prend la libre la plus proche, d’un côté ou de l’autre', () => {
    expect(jointureLibreProche(4, 8, [4])).toBe(3)
    expect(jointureLibreProche(4, 8, [3, 4])).toBe(5)
    expect(jointureLibreProche(4, 3, [1, 2])).toBeNull()
  })
  it('place la lame vers 40 % du mot, sur une jointure libre', () => {
    expect(jointureInitiale(10, [])).toBe(4)
    expect(jointureInitiale(10, [4])).toBe(3)
    expect(jointureInitiale(2, [])).toBe(1)
    expect(jointureInitiale(1, [])).toBeNull()
  })
})

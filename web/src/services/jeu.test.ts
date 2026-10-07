import { describe, expect, it } from 'vitest'

import { GEO, LOGIE, MOT, RECETTE, jeu } from '../test/fixtures'
import { entrelacer, prevoir, rareteMot } from './jeu'

describe('prévisualisation d’une fusion', () => {
  it('suit les mêmes règles que le serveur', () => {
    const catalogue = jeu()
    catalogue.exclusions.push({ combinaison: [GEO, GEO], raison: 'rare' })
    catalogue.recettes.push({ id: 'rct_0000000b', motId: 'unt_0000000b', emplacements: [[GEO], [LOGIE], [LOGIE]] })
    const aucun = new Set<string>()

    expect(prevoir([GEO, LOGIE], catalogue, aucun)).toEqual({ type: 'decouverte', recette_id: RECETTE, mot_id: MOT })
    expect(prevoir([GEO, LOGIE], catalogue, new Set([MOT]))).toEqual({ type: 'connue', recette_id: RECETTE, mot_id: MOT })
    expect(prevoir([GEO, GEO], catalogue, aucun)).toEqual({ type: 'exclue', raison: 'rare' })
    expect(prevoir([LOGIE, GEO], catalogue, aucun)).toEqual({ type: 'presque', motif: 'ordre' })
    expect(prevoir([LOGIE, LOGIE], catalogue, aucun)).toEqual({ type: 'presque', motif: 'incomplet' })
    expect(prevoir([LOGIE, GEO], catalogue, new Set([MOT, 'unt_0000000b']))).toEqual({ type: 'echec' })
  })
})

describe('rareté d’un mot', () => {
  it('suit la même règle que le serveur', () => {
    const catalogue = jeu()
    expect(rareteMot(MOT, catalogue)).toBe('commune')
    const rare = { ...catalogue.briques.get(LOGIE)!, id: 'brq_0000000r', rarete: 'rare' as const }
    const peuCommune = { ...catalogue.briques.get(LOGIE)!, id: 'brq_0000000p', rarete: 'peu_commune' as const }
    const motPose = { ...catalogue.briques.get(LOGIE)!, id: 'brq_0000000m', nature: 'mot' as const, rarete: 'legendaire' as const }
    for (const b of [rare, peuCommune, motPose]) catalogue.briques.set(b.id, b)
    catalogue.recettes.push({ id: 'rct_0000000r', motId: 'unt_0000000r', emplacements: [[GEO], [rare.id]] })
    expect(rareteMot('unt_0000000r', catalogue)).toBe('rare')
    // Une variante moins rare suffit ; un mot posé tel quel compte comme commun.
    catalogue.recettes.push({ id: 'rct_0000000v', motId: 'unt_0000000v', emplacements: [[rare.id, peuCommune.id], [motPose.id]] })
    expect(rareteMot('unt_0000000v', catalogue)).toBe('peu_commune')
    // La recette la plus accessible décide.
    catalogue.recettes.push({ id: 'rct_0000000s', motId: 'unt_0000000r', emplacements: [[GEO], [LOGIE]] })
    expect(rareteMot('unt_0000000r', catalogue)).toBe('commune')
  })
})

describe('entrelacer', () => {
  it('alterne la plus longue et la plus courte restantes', () => {
    expect(entrelacer([3, 9, 1, 7, 5], (n) => n)).toEqual([9, 1, 7, 3, 5])
    expect(entrelacer([], (n: number) => n)).toEqual([])
  })
})

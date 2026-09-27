import { describe, expect, it } from 'vitest'

import { GEO, LOGIE, MOT, RECETTE, jeu } from '../test/fixtures'
import { prevoir } from './jeu'

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

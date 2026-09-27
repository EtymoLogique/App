import { describe, expect, it } from 'vitest'

import { GEO, LOGIE, MOT, cartes, etat, ex, jeu, manifeste } from '../test/fixtures'
import { completude, construireCodex } from './codex'

function catalogue() {
  const c = jeu()
  c.fascicules[0]!.manifeste = { ...manifeste, cartes: cartes.map((x) => ({ id: x.id, role: x.brique ? 'ingredient' : 'resultat', carte: 'r/x' })) }
  return c
}

describe('codex', () => {
  it('montre les briques connues, et le mot en silhouette tant qu’il n’est pas découvert', () => {
    const entrees = construireCodex(catalogue(), etat(), (c) => c)
    const mot = entrees.find((e) => e.id === MOT)
    expect(mot).toMatchObject({ trouvee: false, sens: 'étude de la terre', resultat: true })
    expect(entrees.filter((e) => e.trouvee).map((e) => e.libelle)).toEqual(['géo-', '-logie'])
    expect(completude(entrees)).toEqual({ trouvees: 2, total: 3, legendaires: 0 })
  })

  it('ne trahit jamais une légendaire inconnue ni le mot qui en dépend', () => {
    const c = catalogue()
    const logie = c.briques.get(LOGIE)!
    c.briques.set(LOGIE, { ...logie, rarete: 'legendaire' })
    const carte = c.cartes.get(logie.uniteId)!
    c.cartes.set(logie.uniteId, { ...carte, brique: { ...carte.brique!, rarete: 'legendaire' } })
    const entrees = construireCodex(c, etat({ reserve: [ex(GEO, 2)] }), (x) => x)
    expect(entrees.map((e) => e.id)).toEqual(['unt_0000ge00'])
  })
})

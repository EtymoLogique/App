import { describe, expect, it } from 'vitest'

import { GEO, LOGIE, RECETTE, cartes, etat, ex, jeu, manifeste } from '../test/fixtures'
import { construireCodex } from './codex'
import type { EntreeCodex } from './codex'
import { ciblesIndice, contenuIndice, indiceCourant, indicesDisponibles, indicesObtenus } from './indices'

describe('indices', () => {
  const j = jeu()
  j.fascicules[0]!.manifeste = { ...manifeste, cartes: cartes.map((x) => ({ id: x.id, role: x.brique ? 'ingredient' : 'resultat', carte: 'r/x' })) }
  const recette = j.recettes[0]!

  it('propose les silhouettes à trouver, pas les mots découverts', () => {
    expect(ciblesIndice(j, construireCodex(j, etat())).map((c) => c.recette.id)).toEqual([RECETTE])
    const decouvert = etat({ decouvertes: [{ mot_id: recette.motId, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-01T08:00:00Z' }] })
    expect(ciblesIndice(j, construireCodex(j, decouvert))).toEqual([])
  })

  it('lit chaque indice dans le catalogue, et ne vend que ceux que la fiche porte', () => {
    const entree = construireCodex(j, etat()).find((e) => e.id === recette.motId)!
    expect(contenuIndice(j, entree, 1)).toBeNull()
    expect(contenuIndice(j, { ...entree, silhouette: 'a/xx.svg' }, 1)).toEqual({ silhouette: 'a/xx.svg' })
    expect(contenuIndice(j, entree, 2)).toEqual({ texte: 'étude de la terre' })
    expect(contenuIndice(j, entree, 3)).toEqual({ texte: 'Science de la Terre.' })
    expect(contenuIndice(j, entree, 4)).toBeNull()
    expect(indicesDisponibles(j, entree)).toEqual([2, 3])
    expect(indicesDisponibles(j, { ...entree, definition: null })).toEqual([2])
  })

  it('retient les indices obtenus, dans n’importe quel ordre', () => {
    expect(indicesObtenus(etat(), RECETTE).size).toBe(0)
    const obtenus = indicesObtenus(etat({ indices: [{ recette_id: RECETTE, niveau: 3 }, { recette_id: RECETTE, niveau: 1 }, { recette_id: 'rct_autre', niveau: 2 }] }), RECETTE)
    expect([...obtenus].sort()).toEqual([1, 3])
  })

  it('propose un seul indice : l’entamé, sinon le plus petit n° formable', () => {
    const k = jeu()
    k.recettes = [
      { id: 'r6', motId: 'm6', emplacements: [[GEO], [LOGIE]] },
      { id: 'r7', motId: 'm7', emplacements: [[LOGIE], [GEO]] },
      { id: 'r3', motId: 'm3', emplacements: [['absente'], [GEO]] },
    ]
    const silhouette = (id: string, n: number) => ({ id, n, resultat: true, trouvee: false, legendaire: false, definition: 'une définition' }) as EntreeCodex
    const entrees = [silhouette('m7', 7), silhouette('m6', 6), silhouette('m3', 3)]
    const reserve = [ex(GEO, 1), ex(LOGIE, 1)]
    expect(indiceCourant(k, entrees, etat({ reserve }))?.recette.id).toBe('r6')
    expect(indiceCourant(k, entrees, etat({ reserve, indices: [{ recette_id: 'r7', niveau: 2 }] }))?.recette.id).toBe('r7')
    expect(indiceCourant(k, entrees, etat({ reserve: [] }))).toBeNull()
  })
})

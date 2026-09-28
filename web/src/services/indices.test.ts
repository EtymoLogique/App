import { describe, expect, it } from 'vitest'

import { GEO, RECETTE, cartes, etat, ex, jeu, manifeste } from '../test/fixtures'
import { construireCodex } from './codex'
import { ciblesIndice, contenuIndice, niveauObtenu } from './indices'

describe('indices', () => {
  const j = jeu()
  j.fascicules[0]!.manifeste = { ...manifeste, cartes: cartes.map((x) => ({ id: x.id, role: x.brique ? 'ingredient' : 'resultat', carte: 'r/x' })) }
  const recette = j.recettes[0]!

  it('propose les silhouettes à trouver, pas les mots découverts', () => {
    expect(ciblesIndice(j, construireCodex(j, etat())).map((c) => c.recette.id)).toEqual([RECETTE])
    const decouvert = etat({ decouvertes: [{ mot_id: recette.motId, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-01T08:00:00Z' }] })
    expect(ciblesIndice(j, construireCodex(j, decouvert))).toEqual([])
  })

  it('lit chaque niveau dans le catalogue', () => {
    expect(contenuIndice(j, recette, 1, etat())).toBe('français')
    expect(contenuIndice(j, recette, 2, etat())).toBe('préfixe + suffixe')
    expect(contenuIndice(j, recette, 3, etat())).toBe('Aucune transformation')
    expect(contenuIndice(j, recette, 4, etat({ reserve: [ex(GEO, 1)] }))).toBe('géo- en 1ʳᵉ position')
    expect(contenuIndice(j, recette, 5, etat())).toBe('géo- + -logie')
  })

  it('retient le plus haut niveau obtenu', () => {
    expect(niveauObtenu(etat(), RECETTE)).toBe(0)
    expect(niveauObtenu(etat({ indices: [{ recette_id: RECETTE, niveau: 1 }, { recette_id: RECETTE, niveau: 2 }] }), RECETTE)).toBe(2)
  })
})

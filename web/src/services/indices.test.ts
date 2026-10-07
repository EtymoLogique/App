import { describe, expect, it } from 'vitest'

import { GEO, LOGIE, RECETTE, cartes, etat, ex, jeu, manifeste } from '../test/fixtures'
import { construireCodex } from './codex'
import type { EntreeCodex } from './codex'
import { ciblesIndice, contenuIndice, indiceCourant, niveauObtenu } from './indices'

const texte = (...a: Parameters<typeof contenuIndice>) =>
  contenuIndice(...a)
    .map((p) => (typeof p === 'string' ? p : p.libelle))
    .join('')

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
    expect(texte(j, recette, 1, etat())).toBe('français')
    expect(texte(j, recette, 2, etat())).toBe('préfixe + suffixe')
    expect(texte(j, recette, 3, etat())).toBe('Aucune transformation')
    expect(texte(j, recette, 4, etat({ reserve: [ex(GEO, 1)] }))).toBe('géo- en 1ʳᵉ position')
    expect(texte(j, recette, 4, etat({ reserve: [] }))).toBe('Aucune brique de votre réserve')
    expect(texte(j, recette, 5, etat())).toBe('géo- + -logie')
  })

  it('retient le plus haut niveau obtenu', () => {
    expect(niveauObtenu(etat(), RECETTE)).toBe(0)
    expect(niveauObtenu(etat({ indices: [{ recette_id: RECETTE, niveau: 1 }, { recette_id: RECETTE, niveau: 2 }] }), RECETTE)).toBe(2)
  })

  it('propose un seul indice : l’entamé, sinon le plus petit n° formable', () => {
    const k = jeu()
    k.recettes = [
      { id: 'r6', motId: 'm6', emplacements: [[GEO], [LOGIE]] },
      { id: 'r7', motId: 'm7', emplacements: [[LOGIE], [GEO]] },
      { id: 'r3', motId: 'm3', emplacements: [['absente'], [GEO]] },
    ]
    const silhouette = (id: string, n: number) => ({ id, n, resultat: true, trouvee: false, legendaire: false }) as EntreeCodex
    const entrees = [silhouette('m7', 7), silhouette('m6', 6), silhouette('m3', 3)]
    const reserve = [ex(GEO, 1), ex(LOGIE, 1)]
    expect(indiceCourant(k, entrees, etat({ reserve }))?.recette.id).toBe('r6')
    expect(indiceCourant(k, entrees, etat({ reserve, indices: [{ recette_id: 'r7', niveau: 2 }] }))?.recette.id).toBe('r7')
    expect(indiceCourant(k, entrees, etat({ reserve: [] }))).toBeNull()
  })
})

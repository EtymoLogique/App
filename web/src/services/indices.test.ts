import { describe, expect, it } from 'vitest'

import { GEO, LOGIE, RECETTE, cartes, etat, ex, jeu, manifeste } from '../test/fixtures'
import { construireCodex } from './codex'
import type { EntreeCodex } from './codex'
import { ciblesIndice, contenuIndice, enquetesEnCours, indiceCourant, indicesDisponibles, indicesObtenus } from './indices'

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
    expect(indicesDisponibles(j, entree)).toEqual([3, 2])
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
    // Entamée mais plus faisable : on propose la plus petite faisable.
    expect(indiceCourant(k, entrees, etat({ reserve: [ex(GEO, 1), ex(LOGIE, 1)], indices: [{ recette_id: 'r3', niveau: 1 }] }))?.recette.id).toBe('r6')
    // Tous les indices obtenus : on passe à la suivante.
    expect(indiceCourant(k, entrees, etat({ reserve, indices: [{ recette_id: 'r6', niveau: 3 }] }))?.recette.id).toBe('r7')
    expect(indiceCourant(k, entrees, etat({ reserve: [] }))).toBeNull()
  })

  describe('enquêtes en cours', () => {
    const k = jeu()
    k.recettes = [
      { id: 'r6', motId: 'm6', emplacements: [[GEO], [LOGIE]] },
      { id: 'r7', motId: 'm7', emplacements: [[LOGIE], [GEO]] },
      { id: 'r9', motId: 'm9', emplacements: [['absente'], [GEO]] },
    ]
    const carte = (id: string, n: number, extra: Partial<EntreeCodex> = {}) =>
      ({ id, n, resultat: true, trouvee: false, legendaire: false, definition: 'une définition', silhouette: 'a/xx.svg', ...extra }) as EntreeCodex
    const entrees = [carte('m9', 9), carte('m7', 7), carte('m6', 6)]

    it('liste les cartes dont un indice est acheté, par n°, même hors de portée de la réserve', () => {
      const e = etat({ reserve: [], indices: [{ recette_id: 'r9', niveau: 1 }, { recette_id: 'r7', niveau: 3 }, { recette_id: 'r7', niveau: 1 }] })
      const liste = enquetesEnCours(k, entrees, e)
      expect(liste.map((x) => x.entree.n)).toEqual([7, 9])
      // Dans l'ordre d'affichage, et seulement ce qui est payé.
      expect(liste[0]!.obtenus.map((o) => o.niveau)).toEqual([1, 3])
      expect(liste[1]!.obtenus).toEqual([{ niveau: 1, titre: 'Silhouette', contenu: { silhouette: 'a/xx.svg' } }])
    })

    it('oublie une carte trouvée, une légendaire et une carte sans indice', () => {
      const indices = [{ recette_id: 'r6', niveau: 1 }, { recette_id: 'r7', niveau: 1 }]
      const liste = enquetesEnCours(k, [carte('m6', 6, { trouvee: true }), carte('m7', 7, { legendaire: true }), carte('m9', 9)], etat({ indices }))
      expect(liste).toEqual([])
      expect(enquetesEnCours(k, entrees, etat())).toEqual([])
      expect(enquetesEnCours(k, entrees, null)).toEqual([])
    })
  })
})

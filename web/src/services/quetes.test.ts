import { describe, expect, it } from 'vitest'

import { GEO, MOT, RECETTE, etat, jeu, manifeste } from '../test/fixtures'
import { quetesDeFascicule, recompensesARecuperer } from './quetes'

const JALON = 'jal_0000000a'
const SUIVANT = 'jal_0000000b'

/** Catalogue fictif dont le fascicule déclare deux jalons, à 1 puis 2 découvertes. */
function avecJalons() {
  const j = jeu()
  const m = {
    ...manifeste,
    cartes: [{ id: MOT, role: 'resultat' as const, carte: 'r/0.json' }],
    jalons: [
      { id: JALON, decouvertes: 1, pli: [GEO], sabliers: 0 },
      { id: SUIVANT, decouvertes: 2, pli: [], sabliers: 2 },
    ],
  }
  return { ...j, fascicules: [{ numero: 0, parution: m.parution, manifeste: m }] }
}

const decouvert = [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }]

describe('quêtes de fascicule', () => {
  it('suit la progression vers chaque jalon', () => {
    const quetes = quetesDeFascicule(avecJalons(), etat({ decouvertes: decouvert }))
    expect(quetes.map((q) => [q.jalon.id, q.avancee, q.etat])).toEqual([
      [JALON, 1, 'en_cours'],
      [SUIVANT, 1, 'en_cours'],
    ])
  })

  it('attend que le serveur dise un jalon atteint, puis sa récupération', () => {
    const j = avecJalons()
    const atteint = etat({ decouvertes: decouvert, jalons_atteints: [JALON], jalons_recuperes: [] })
    expect(quetesDeFascicule(j, atteint)[0]?.etat).toBe('a_recuperer')
    expect(recompensesARecuperer(j, atteint)).toBe(1)
    const recupere = { ...atteint, jalons_recuperes: [JALON] }
    expect(quetesDeFascicule(j, recupere)[0]?.etat).toBe('recupere')
    expect(recompensesARecuperer(j, recupere)).toBe(0)
  })

  it('ne compte rien sans état confirmé', () => {
    expect(recompensesARecuperer(avecJalons(), null)).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'

import { GEO, MOT, RECETTE, etat, jeu, manifeste } from '../test/fixtures'
import { quetesAuLongCours, quetesDeFascicule, recompensesARecuperer } from './quetes'

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

const QUETE = 'qlc_0000000a'
const PALIER = 'pal_0000000a'
const AUTRE = 'pal_0000000b'

/** Catalogue fictif qui déclare une quête de langue, à un puis trois paliers de formes. */
function avecQuete() {
  const quete = {
    id: QUETE,
    sorte: 'langue' as const,
    langue_id: 'lng_0000000a',
    libelles: { fr: { titre: 'Grec ancien', consigne: 'Trouvez des formes de grec ancien.' } },
    paliers: [
      { id: AUTRE, seuil: 3, sabliers: 1 },
      { id: PALIER, seuil: 1, encre: 5 },
    ],
  }
  return { ...jeu(), quetes: [quete] }
}

describe('quêtes au long cours', () => {
  it('lit la progression du serveur et range les paliers par seuil', () => {
    const [longue] = quetesAuLongCours(avecQuete(), etat({ progression_quetes: [{ quete_id: QUETE, progression: 2 }] }))
    expect(longue?.titre).toBe('Grec ancien')
    expect(longue?.paliers.map((p) => [p.palier.id, p.avancee, p.etat])).toEqual([
      [PALIER, 1, 'a_recuperer'],
      [AUTRE, 2, 'en_cours'],
    ])
  })

  it('distingue le palier récupéré et compte ceux qui attendent', () => {
    const j = avecQuete()
    const e = etat({ progression_quetes: [{ quete_id: QUETE, progression: 3 }], paliers_recuperes: [PALIER] })
    expect(quetesAuLongCours(j, e)[0]?.paliers.map((p) => p.etat)).toEqual(['recupere', 'a_recuperer'])
    expect(recompensesARecuperer(j, e)).toBe(1)
  })

  it('ne compte rien sans progression confirmée, et marque les sortes pas encore ouvertes', () => {
    const j = avecQuete()
    expect(recompensesARecuperer(j, etat())).toBe(0)
    expect(quetesAuLongCours(j, etat())[0]?.ouverte).toBe(true)
    const ricochets = { ...j.quetes[0]!, sorte: 'ricochets' as const }
    expect(quetesAuLongCours({ ...j, quetes: [ricochets] }, etat())[0]?.ouverte).toBe(false)
  })
})

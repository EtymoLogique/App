import { describe, expect, it } from 'vitest'

import { type DonneesRicochets, juger, morceauxDuMot, retour } from './ricochets'

const d: DonneesRicochets = {
  briques: new Map([
    ['brq_1', { sens: 'sns_1', classe: 'sns_1', position: 'prefixe' as const }],
    ['brq_2', { sens: 'sns_2', classe: 'sns_2', position: 'suffixe' as const }],
    ['brq_3', { sens: 'sns_3', classe: 'sns_1', position: null }],
  ]),
  mots: new Map([
    ['unt_1', { classe: 'unt_1', decoupes: [[3]], alternatives: [[4]], assemblage: ['brq_1', 'brq_2'] }],
    ['unt_2', { classe: 'unt_1', decoupes: [], assemblage: [] }],
    ['unt_3', { classe: null, decoupes: [], assemblage: [] }],
    ['unt_4', { classe: null, decoupes: [[1], [1, 3]], assemblage: [] }],
  ]),
  gloses: new Map(),
}

describe('juger', () => {
  it('sens d’une brique : le sien, ou celui d’une brique de même glose', () => {
    expect(juger(d, 'sens_brique', 'brq_1', 'sns_1')).toBe(true)
    expect(juger(d, 'sens_brique', 'brq_1', 'sns_3')).toBe(true)
    expect(juger(d, 'sens_brique', 'brq_1', 'sns_2')).toBe(false)
    expect(juger(d, 'paires', 'brq_2', 'sns_2')).toBe(true)
  })
  it('brique d’un sens et mot d’un sens littéral', () => {
    expect(juger(d, 'brique_sens', 'brq_1', 'brq_3')).toBe(true)
    expect(juger(d, 'brique_sens', 'brq_1', 'brq_2')).toBe(false)
    expect(juger(d, 'mot_sens', 'unt_1', 'unt_2')).toBe(true)
    expect(juger(d, 'mot_sens', 'unt_3', 'unt_1')).toBeNull()
  })
  it('découper : l’ordre et les doublons ne comptent pas', () => {
    expect(juger(d, 'decouper', 'unt_1', [3, 3])).toBe(true)
    expect(juger(d, 'decouper', 'unt_1', [2])).toBe(false)
    expect(juger(d, 'decouper', 'unt_1', [4])).toBe(true)
    expect(juger(d, 'decouper', 'unt_2', [1])).toBeNull()
    expect(juger(d, 'decouper', 'unt_1', [[3]])).toBe(true)
  })
  it('découper un mot à plusieurs découpes : il faut toutes les trouver', () => {
    expect(juger(d, 'decouper', 'unt_4', [1])).toBe(false)
    expect(juger(d, 'decouper', 'unt_4', [[1]])).toBe(false)
    expect(juger(d, 'decouper', 'unt_4', [[1], [1, 3]])).toBe(true)
    expect(juger(d, 'decouper', 'unt_4', [[3, 1], [1], [1]])).toBe(true)
    expect(juger(d, 'decouper', 'unt_4', [[1], [2]])).toBe(false)
    expect(juger(d, 'decouper', 'unt_4', [[1], [1, 3], [2]])).toBe(false)
  })
  it('assembler : la paire exacte, préfixe puis suffixe', () => {
    expect(juger(d, 'assembler', 'unt_1', ['brq_1', 'brq_2'])).toBe(true)
    expect(juger(d, 'assembler', 'unt_1', ['brq_1', 'brq_3'])).toBe(false)
    expect(juger(d, 'assembler', 'unt_1', ['brq_2', 'brq_1'])).toBe(false)
    expect(juger(d, 'assembler', 'unt_1', ['brq_1'])).toBeNull()
    expect(juger(d, 'assembler', 'unt_2', ['brq_1', 'brq_2'])).toBeNull()
  })
})

describe('morceauxDuMot', () => {
  const composition = (parties: [string, number, number][]) => ({
    preferee: true,
    parties: parties.map(([unite_id, segment_debut, segment_fin], i) => ({ rang: i + 1, unite_id, segment_debut, segment_fin })),
  })
  const jeu = (cartes: Record<string, unknown>) => ({ cartes: new Map(Object.entries(cartes)) }) as never

  it('descend dans les parties qui sont des mots composés : étymologiste = étymo · logie · iste', () => {
    const j = jeu({
      mot: { nature: 'mot', compositions: [composition([['logie_mot', 0, 10], ['iste', 10, 13]])] },
      logie_mot: { nature: 'mot', compositions: [composition([['etymo', 0, 5], ['logie', 5, 10]])] },
      etymo: { nature: 'prefixe' },
      logie: { nature: 'suffixe' },
      iste: { nature: 'suffixe' },
    })
    expect(morceauxDuMot(j, 'mot')).toEqual([
      { debut: 0, fin: 5, nature: 'prefixe' },
      { debut: 5, fin: 10, nature: 'suffixe' },
      { debut: 10, fin: 13, nature: 'suffixe' },
    ])
  })
  it('une partie élidée est bornée par son segment : biologie dans biologiste', () => {
    // biologie (8 lettres) n'occupe que [0, 6) de biologiste : sa dernière partie perd « ie ».
    const j = jeu({
      mot: { nature: 'mot', compositions: [composition([['biologie', 0, 6], ['iste', 6, 10]])] },
      biologie: { nature: 'mot', compositions: [composition([['bio', 0, 3], ['logie', 3, 8]])] },
      bio: { nature: 'prefixe' },
      logie: { nature: 'suffixe' },
      iste: { nature: 'suffixe' },
    })
    expect(morceauxDuMot(j, 'mot')).toEqual([
      { debut: 0, fin: 3, nature: 'prefixe' },
      { debut: 3, fin: 6, nature: 'suffixe' },
      { debut: 6, fin: 10, nature: 'suffixe' },
    ])
  })
  it('sans segments continus, les parties gardent leurs bornes absentes', () => {
    const j = jeu({ mot: { nature: 'mot', compositions: [{ preferee: true, parties: [{ rang: 1, unite_id: 'a' }, { rang: 2, unite_id: 'b' }] }] } })
    expect(morceauxDuMot(j, 'mot').map((m) => m.debut)).toEqual([-1, -1])
  })
})

describe('retour', () => {
  const carte = (jours: number, maitrisee = false) => ({
    niveau: 1,
    maitrisee,
    bonnes_niveau_3: 0,
    prochaine_revision: new Date(Date.UTC(2026, 9, 3 + jours)).toISOString().slice(0, 10),
  })
  const auj = new Date(Date.UTC(2026, 9, 3, 12))
  it('dit le délai', () => {
    expect(retour(carte(1), auj)).toBe('Demain')
    expect(retour(carte(3), auj)).toBe('Dans 3 jours')
    expect(retour(carte(7, true), auj)).toBe('Maîtrisée · dans 7 jours')
  })
})

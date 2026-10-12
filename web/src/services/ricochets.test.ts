import { describe, expect, it } from 'vitest'

import { type DonneesRicochets, juger, retour } from './ricochets'

const d: DonneesRicochets = {
  briques: new Map([
    ['brq_1', { sens: 'sns_1', classe: 'sns_1', position: 'prefixe' as const }],
    ['brq_2', { sens: 'sns_2', classe: 'sns_2', position: 'suffixe' as const }],
    ['brq_3', { sens: 'sns_3', classe: 'sns_1', position: null }],
  ]),
  mots: new Map([
    ['unt_1', { classe: 'unt_1', coupes: [3], assemblage: ['brq_1', 'brq_2'] }],
    ['unt_2', { classe: 'unt_1', coupes: [], assemblage: [] }],
    ['unt_3', { classe: null, coupes: [], assemblage: [] }],
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
    expect(juger(d, 'decouper', 'unt_2', [1])).toBeNull()
  })
  it('assembler : la paire exacte, préfixe puis suffixe', () => {
    expect(juger(d, 'assembler', 'unt_1', ['brq_1', 'brq_2'])).toBe(true)
    expect(juger(d, 'assembler', 'unt_1', ['brq_1', 'brq_3'])).toBe(false)
    expect(juger(d, 'assembler', 'unt_1', ['brq_2', 'brq_1'])).toBe(false)
    expect(juger(d, 'assembler', 'unt_1', ['brq_1'])).toBeNull()
    expect(juger(d, 'assembler', 'unt_2', ['brq_1', 'brq_2'])).toBeNull()
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

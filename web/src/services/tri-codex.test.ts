import { describe, expect, it } from 'vitest'

import { type EntreeCodex, tri } from '../services/codex'

const carte = (id: string, n: number, trouveeLe: string | null, maitrise: EntreeCodex['maitrise']) =>
  ({ id, n, trouvee: trouveeLe !== null, trouveeLe, maitrise, libelle: id, type: 'mot', fascicule: 0 }) as EntreeCodex

const A = carte('a', 1, '2026-10-01T10:00:00Z', { niveau: 1, maitrisee: false })
const B = carte('b', 2, '2026-10-03T10:00:00Z', { niveau: 3, maitrisee: true })
const C = carte('c', 3, '2026-10-02T10:00:00Z', { niveau: 2, maitrisee: false })
const D = carte('d', 4, null, null)
const ids = (t: 'date' | 'maitrise', inverse: boolean) => [D, A, B, C].sort(tri(t, inverse)).map((e) => e.id)

describe('tri du codex', () => {
  it('par découverte : les plus récentes d’abord, ce qui reste à trouver à la fin', () => {
    expect(ids('date', false)).toEqual(['b', 'c', 'a', 'd'])
    expect(ids('date', true)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('par maîtrise : les plus maîtrisées d’abord, ce qui reste à trouver à la fin', () => {
    expect(ids('maitrise', false)).toEqual(['b', 'c', 'a', 'd'])
    expect(ids('maitrise', true)).toEqual(['a', 'c', 'b', 'd'])
  })
})

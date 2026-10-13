import { describe, expect, it } from 'vitest'

import type { Etat } from '../contrat'
import { conditionDeblocage, fasciculesDebloques, jalonDeblocant, nouveauxFascicules, precedent } from './deblocage'
import type { FasciculeParu } from './jeu'

function fascicule(numero: number, nom: string | null = null): FasciculeParu {
  return {
    numero,
    parution: '2026-10-01T00:00:00Z',
    manifeste: {
      id: `fsc_0000000${numero}`,
      numero,
      nom,
      jalons: [
        { id: `jal_${numero}000000a`, decouvertes: 5, pli: [], sabliers: 1 },
        { id: `jal_${numero}000000b`, decouvertes: 10, pli: [], sabliers: 1 },
      ],
    } as unknown as FasciculeParu['manifeste'],
  }
}

const [deux, un, trois] = [fascicule(2, 'Lettrine'), fascicule(1, 'Incipit'), fascicule(3)]
const jeu = { fascicules: [deux, un, trois] }
const etat = (ids: string[]) => ({ fascicules_debloques: ids.map((fascicule_id) => ({ fascicule_id, debloque_le: '2026-10-12T00:00:00Z' })) }) as Pick<Etat, 'fascicules_debloques'>

describe('déblocage des fascicules', () => {
  it('suit le serveur, et tient tout pour débloqué sans information', () => {
    expect([...fasciculesDebloques(jeu, etat(['fsc_00000001']))]).toEqual(['fsc_00000001'])
    expect(fasciculesDebloques(jeu, null).size).toBe(3)
    expect(fasciculesDebloques(jeu, etat([])).size).toBe(3)
  })

  it('nomme le fascicule précédent dans la condition', () => {
    expect(precedent(jeu, trois)?.numero).toBe(2)
    expect(conditionDeblocage(jeu, deux)).toBe('Atteignez le 2ᵉ jalon de Incipit')
    expect(conditionDeblocage(jeu, trois)).toBe('Atteignez le 2ᵉ jalon de Lettrine')
  })

  it('reconnaît le 2ᵉ jalon', () => {
    expect(jalonDeblocant(un, 'jal_1000000b')).toBe(true)
    expect(jalonDeblocant(un, 'jal_1000000a')).toBe(false)
  })

  it('ne dit nouveau que ce qui s’ajoute à une liste mémorisée', () => {
    const debloques = new Set(['fsc_00000001', 'fsc_00000002'])
    expect(nouveauxFascicules(debloques, null).size).toBe(0)
    expect([...nouveauxFascicules(debloques, new Set(['fsc_00000001']))]).toEqual(['fsc_00000002'])
  })
})

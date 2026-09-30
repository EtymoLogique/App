import { describe, expect, it } from 'vitest'

import { ROUTE_PAR_DEFAUT, ecrireRoute, lireRoute } from './route'

describe('route', () => {
  it('écrit puis relit la même vue du codex', () => {
    const route = { onglet: 'codex' as const, carte: 'unt_dg3f1bfz', pli: null, quete: null, plus: true, vue: 'familles' as const, filtre: 'mot' as const, tri: 'az' as const, inverse: true, fascicule: 0 }
    expect(ecrireRoute(route)).toBe('#/codex/unt_dg3f1bfz?vue=familles&type=mot&tri=az&sens=inverse&fascicule=0&plus=1')
    expect(lireRoute(ecrireRoute(route))).toEqual(route)
  })

  it('ne déplie « En savoir plus » que sous une carte ouverte', () => {
    expect(lireRoute('#/codex?plus=1').plus).toBe(false)
    expect(ecrireRoute({ ...ROUTE_PAR_DEFAUT, onglet: 'codex', plus: true })).toBe('#/codex')
  })

  it('retombe sur la table devant une adresse inconnue ou forgée', () => {
    expect(lireRoute('')).toEqual(ROUTE_PAR_DEFAUT)
    expect(lireRoute('#/ailleurs')).toEqual(ROUTE_PAR_DEFAUT)
    expect(lireRoute('#/codex/<script>?vue=z&type=x&tri=y&fascicule=-1')).toEqual({ ...ROUTE_PAR_DEFAUT, onglet: 'codex' })
    expect(lireRoute('#/plis')).toEqual({ ...ROUTE_PAR_DEFAUT, onglet: 'plis' })
  })

  it('ouvre l’atelier du pli d’un fascicule', () => {
    expect(lireRoute('#/plis/fsc_qcnkaf5m')).toEqual({ ...ROUTE_PAR_DEFAUT, onglet: 'plis', pli: 'fsc_qcnkaf5m' })
    expect(ecrireRoute({ ...ROUTE_PAR_DEFAUT, onglet: 'plis', pli: 'fsc_qcnkaf5m' })).toBe('#/plis/fsc_qcnkaf5m')
    expect(lireRoute('#/plis/unt_dg3f1bfz').pli).toBeNull()
  })

  it('ouvre un onglet des quêtes, filtré par fascicule', () => {
    expect(lireRoute('#/quetes')).toEqual({ ...ROUTE_PAR_DEFAUT, onglet: 'quetes' })
    const route = { ...ROUTE_PAR_DEFAUT, onglet: 'quetes' as const, quete: 'fascicules' as const, fascicule: 1 }
    expect(ecrireRoute(route)).toBe('#/quetes/fascicules?fascicule=1')
    expect(lireRoute(ecrireRoute(route))).toEqual(route)
    expect(ecrireRoute({ ...route, quete: 'journalieres' })).toBe('#/quetes/journalieres')
    expect(lireRoute('#/quetes/<script>').quete).toBeNull()
  })
})

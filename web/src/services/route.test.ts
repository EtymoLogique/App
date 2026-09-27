import { describe, expect, it } from 'vitest'

import { ROUTE_PAR_DEFAUT, ecrireRoute, lireRoute } from './route'

describe('route', () => {
  it('écrit puis relit la même vue du codex', () => {
    const route = { onglet: 'codex' as const, carte: 'unt_dg3f1bfz', filtre: 'mot' as const, tri: 'az' as const, fascicule: 0 }
    expect(ecrireRoute(route)).toBe('#/codex/unt_dg3f1bfz?type=mot&tri=az&fascicule=0')
    expect(lireRoute(ecrireRoute(route))).toEqual(route)
  })

  it('retombe sur la table devant une adresse inconnue ou forgée', () => {
    expect(lireRoute('')).toEqual(ROUTE_PAR_DEFAUT)
    expect(lireRoute('#/ailleurs')).toEqual(ROUTE_PAR_DEFAUT)
    expect(lireRoute('#/codex/<script>?type=x&tri=y&fascicule=-1')).toEqual({ ...ROUTE_PAR_DEFAUT, onglet: 'codex' })
    expect(lireRoute('#/plis')).toEqual({ ...ROUTE_PAR_DEFAUT, onglet: 'plis' })
  })
})

import { describe, expect, it, vi } from 'vitest'

import type { Decouverte } from '../contrat'
import { etat } from '../test/fixtures'
import { SOUVENIR_VIERGE, doitRelancer, fermerRelance } from './compte'

const decouvertes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ mot_id: `unt_0000000${i}`, recette_id: `rct_0000000${i}`, numero: i + 1, decouverte_le: '2026-10-01T08:00:00Z' }) as Decouverte)

describe('relance « Sauvegardez votre progression »', () => {
  it('apparaît à la 3ᵉ découverte, pas avant', () => {
    expect(doitRelancer(etat({ decouvertes: decouvertes(2) }), SOUVENIR_VIERGE)).toBe(false)
    expect(doitRelancer(etat({ decouvertes: decouvertes(3) }), SOUVENIR_VIERGE)).toBe(true)
  })

  it('jamais avec un compte', () => {
    expect(doitRelancer(etat({ decouvertes: decouvertes(5), compte: { pseudo: 'abc-1234', pseudo_confirme: false } }), SOUVENIR_VIERGE)).toBe(false)
  })

  it('refermée, elle revient à un nouveau jalon ou après 7 jours de jeu', () => {
    const avant = etat({ decouvertes: decouvertes(3), jours_de_jeu: 4, jalons_atteints: ['jal_00000001'] })
    const souvenir = fermerRelance(avant)
    expect(doitRelancer(avant, souvenir)).toBe(false)
    expect(doitRelancer({ ...avant, decouvertes: decouvertes(9), jours_de_jeu: 10 }, souvenir)).toBe(false)
    expect(doitRelancer({ ...avant, jours_de_jeu: 11 }, souvenir)).toBe(true)
    expect(doitRelancer({ ...avant, jalons_atteints: ['jal_00000001', 'jal_00000002'] }, souvenir)).toBe(true)
  })

  it('après une déconnexion, elle revient tout de suite, puis suit les mêmes règles', () => {
    expect(doitRelancer(etat(), SOUVENIR_VIERGE, true)).toBe(true)
    expect(doitRelancer(etat(), fermerRelance(etat()), true)).toBe(false)
  })

  it('un jalon atteint suffit, même avant la 3ᵉ découverte', () => {
    expect(doitRelancer(etat({ jalons_atteints: ['jal_00000001'] }), SOUVENIR_VIERGE)).toBe(true)
  })
})

describe('lien de connexion', () => {
  it('lit le défi et le jeton une fois, puis les retire de l’adresse', async () => {
    vi.resetModules()
    window.history.replaceState(null, '', '/#/connexion?defi=d-1&jeton=abc_-')
    const { lienDeConnexion, oublierLien } = await import('./compte')
    expect(lienDeConnexion()).toEqual({ defi: 'd-1', jeton: 'abc_-' })
    expect(window.location.hash).toBe('#/connexion')
    expect(lienDeConnexion()).toEqual({ defi: 'd-1', jeton: 'abc_-' })
    oublierLien()
    expect(lienDeConnexion()).toBeNull()
    // Un second lien ouvert dans la PWA déjà chargée (hashchange) est lu à son tour.
    window.history.replaceState(null, '', '/#/connexion?defi=d-2&jeton=xyz')
    expect(lienDeConnexion()).toEqual({ defi: 'd-2', jeton: 'xyz' })
    expect(window.location.hash).toBe('#/connexion')
  })

  it('ignore une autre route', async () => {
    vi.resetModules()
    window.history.replaceState(null, '', '/#/codex?defi=d&jeton=j')
    const { lienDeConnexion } = await import('./compte')
    expect(lienDeConnexion()).toBeNull()
    expect(window.location.hash).toBe('#/codex?defi=d&jeton=j')
  })
})

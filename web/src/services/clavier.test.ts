import { afterEach, describe, expect, it, vi } from 'vitest'

import { ouvreLeClavier, suivreLeClavier, zoneVisible } from './clavier'

describe('zoneVisible', () => {
  it('ne publie rien sans clavier, ni quand seule la barre d’adresse bouge', () => {
    expect(zoneVisible({ height: 800, offsetTop: 0, scale: 1 }, 800)).toBeNull()
    expect(zoneVisible({ height: 740, offsetTop: 0, scale: 1 }, 800)).toBeNull()
  })

  it('publie la partie visible au-dessus du clavier', () => {
    expect(zoneVisible({ height: 420, offsetTop: 0, scale: 1 }, 800)).toEqual({ haut: 0, hauteur: 420 })
    expect(zoneVisible({ height: 420, offsetTop: 150, scale: 1 }, 800)).toEqual({ haut: 150, hauteur: 420 })
  })

  it('ignore un zoom à deux doigts', () => {
    expect(zoneVisible({ height: 400, offsetTop: 0, scale: 2 }, 800)).toBeNull()
  })
})

describe('ouvreLeClavier', () => {
  it('reconnaît les champs de saisie, pas les boutons ni les cases', () => {
    const champ = (type: string) => Object.assign(document.createElement('input'), { type })
    expect(ouvreLeClavier(champ('text'))).toBe(true)
    expect(ouvreLeClavier(champ('email'))).toBe(true)
    expect(ouvreLeClavier(document.createElement('textarea'))).toBe(true)
    expect(ouvreLeClavier(champ('radio'))).toBe(false)
    expect(ouvreLeClavier(document.createElement('button'))).toBe(false)
    expect(ouvreLeClavier(null)).toBe(false)
  })
})

describe('suivreLeClavier', () => {
  const racine = document.documentElement
  let debrancher = () => {}
  afterEach(() => {
    debrancher()
    racine.removeAttribute('data-clavier')
    racine.style.removeProperty('--vue-haut')
    racine.style.removeProperty('--vue-hauteur')
    document.body.innerHTML = ''
  })

  it('cale les modales sur la zone visible quand le clavier s’ouvre, puis les libère', () => {
    const vue = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 })
    vi.stubGlobal('visualViewport', vue)
    vi.stubGlobal('innerHeight', 800)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => {
      f(0)
      return 0
    })
    document.body.innerHTML = '<div class="scrim"><input id="pseudo" /></div>'
    const champ = document.getElementById('pseudo') as HTMLInputElement
    const defile = vi.fn()
    champ.scrollIntoView = defile
    champ.focus()

    debrancher = suivreLeClavier(window)
    expect(racine.hasAttribute('data-clavier')).toBe(false)

    Object.assign(vue, { height: 420, offsetTop: 30 })
    vue.dispatchEvent(new Event('resize'))
    expect(racine.hasAttribute('data-clavier')).toBe(true)
    expect(racine.style.getPropertyValue('--vue-haut')).toBe('30px')
    expect(racine.style.getPropertyValue('--vue-hauteur')).toBe('420px')
    expect(defile).toHaveBeenCalledWith({ block: 'nearest' })

    Object.assign(vue, { height: 800, offsetTop: 0 })
    vue.dispatchEvent(new Event('resize'))
    expect(racine.hasAttribute('data-clavier')).toBe(false)
    expect(racine.style.getPropertyValue('--vue-hauteur')).toBe('')
  })
})

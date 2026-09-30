import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Navigation } from './Navigation'

const rendu = (props: Partial<Parameters<typeof Navigation>[0]> = {}) => {
  const onChoisir = vi.fn()
  render(<Navigation actif="table" compteurs={{}} onChoisir={onChoisir} {...props} />)
  return onChoisir
}
const burger = () => screen.getByRole('button', { name: /^Menu/ })

describe('menu burger mobile', () => {
  it('range Boutique et Réglages dans le burger', () => {
    rendu()
    expect(burger().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(burger())
    expect(burger().getAttribute('aria-expanded')).toBe('true')
    const panneau = document.getElementById(burger().getAttribute('aria-controls') as string) as HTMLElement
    expect(within(panneau).getAllByRole('button').map((b) => b.textContent)).toEqual(['Boutique', 'Réglages'])
  })

  it('Escape ferme et rend le focus', () => {
    rendu()
    fireEvent.click(burger())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(burger().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(burger())
  })

  it('un clic extérieur ferme', () => {
    rendu()
    fireEvent.click(burger())
    fireEvent.pointerDown(document.body)
    expect(burger().getAttribute('aria-expanded')).toBe('false')
  })

  it('choisir une entrée cachée navigue et ferme', () => {
    const onChoisir = rendu()
    fireEvent.click(burger())
    fireEvent.click(within(document.getElementById(burger().getAttribute('aria-controls') as string) as HTMLElement).getByRole('button', { name: 'Réglages' }))
    expect(onChoisir).toHaveBeenCalledWith('reglages')
    expect(burger().getAttribute('aria-expanded')).toBe('false')
  })

  it('le burger est actif et cumule les compteurs quand l’actif est caché', () => {
    rendu({ actif: 'boutique', compteurs: { boutique: 1, reglages: 2 } })
    expect(burger().className).toContain('on')
    expect(within(burger()).getByLabelText('3 nouveautés')).toBeTruthy()
  })

  it('pas de burger avec 4 entrées ou moins', () => {
    rendu({ onglets: [{ id: 'table', libelle: 'Table', icone: 'table' }, { id: 'plis', libelle: 'Plis', icone: 'pli' }] })
    expect(screen.queryByRole('button', { name: /^Menu/ })).toBeNull()
  })
})

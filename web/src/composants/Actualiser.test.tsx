import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Actualiser } from './Actualiser'

/** Un doigt qui tire de `depuis` jusqu'à `jusqua` (en px) puis se lève. */
function tirer(cible: Element, depuis: number, jusqua: number, x = 100) {
  fireEvent.touchStart(cible, { touches: [{ clientX: x, clientY: depuis }] })
  fireEvent.touchMove(cible, { touches: [{ clientX: x, clientY: jusqua }] })
  fireEvent.touchEnd(cible, { touches: [] })
}

describe('tirer pour actualiser', () => {
  beforeEach(() => {
    // PWA installée : le geste n'existe qu'en mode autonome.
    vi.stubGlobal('matchMedia', (requete: string) => ({ matches: requete === '(display-mode: standalone)' }))
  })

  it('actualise quand on tire assez loin depuis le haut de la page', async () => {
    let finir = () => {}
    const onActualiser = vi.fn(() => new Promise<void>((fin) => (finir = fin)))
    render(<Actualiser onActualiser={onActualiser} />)
    act(() => tirer(document.body, 10, 60))
    expect(onActualiser).not.toHaveBeenCalled()
    act(() => tirer(document.body, 10, 300))
    expect(onActualiser).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Actualisation…')
    await act(async () => finir())
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('ignore le geste dans un dialogue ou sur une brique qu’on fait glisser', () => {
    const onActualiser = vi.fn(() => Promise.resolve())
    render(
      <>
        <Actualiser onActualiser={onActualiser} />
        <div role="dialog">dialogue</div>
        <span draggable="true">brique</span>
      </>,
    )
    act(() => tirer(screen.getByText('dialogue'), 10, 300))
    act(() => tirer(screen.getByText('brique'), 10, 300))
    expect(onActualiser).not.toHaveBeenCalled()
  })
})

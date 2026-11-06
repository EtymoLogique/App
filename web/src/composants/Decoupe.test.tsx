import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Decoupe } from './Decoupe'

function monter(mot: string, attendu: number[], reels: { nature: 'prefixe' | 'mot' | 'suffixe' }[]) {
  const pied = document.body.appendChild(document.createElement('footer'))
  const onValider = vi.fn()
  const repondu = vi.fn()
  render(
    <Decoupe
      mot={mot}
      attendu={attendu}
      reels={reels}
      consigne="Où ce mot se coupe-t-il ?"
      lecon="Leçon."
      juger={(c) => c.length === attendu.length && c.every((x, i) => x === attendu[i])}
      onValider={onValider}
      repondu={repondu}
      pied={pied}
    />,
  )
  return { onValider, repondu, pied }
}

const GEO = [{ nature: 'prefixe' as const }, { nature: 'suffixe' as const }]
const AUTO = [{ nature: 'prefixe' as const }, { nature: 'mot' as const }, { nature: 'suffixe' as const }]
const curseur = () => screen.getByRole('slider').getAttribute('aria-valuenow')

describe('Decoupe', () => {
  // La lame arrive sur un leurre tiré au hasard : 0,37 la pose en 4 dans « géographie », en 6 dans « autobiographie ».
  beforeEach(() => void vi.spyOn(Math, 'random').mockReturnValue(0.37))
  afterEach(() => vi.restoreAllMocks())

  it('la lame n’arrive jamais sur une coupe attendue, ni à la première coupe ni aux suivantes', () => {
    vi.restoreAllMocks()
    for (let i = 0; i < 20; i++) {
      const pied = document.body.appendChild(document.createElement('footer'))
      const { unmount } = render(
        <Decoupe mot="autobiographie" attendu={[4, 7]} reels={AUTO} consigne="" lecon="" juger={() => null} onValider={() => {}} repondu={() => {}} pied={pied} />,
      )
      expect(['4', '7']).not.toContain(curseur())
      fireEvent.click(screen.getByRole('button', { name: 'Couper ici' }))
      expect(['4', '7']).not.toContain(curseur())
      unmount()
      pied.remove()
    }
  })

  it('place la lame à l’arrivée et rien n’est envoyé avant « Couper ici »', () => {
    const { onValider } = monter('géographie', [3], GEO)
    expect(curseur()).toBe('4')
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Entre « géog » et « raphie »')
    fireEvent.click(screen.getByRole('button', { name: 'Une lettre vers la gauche' }))
    expect(curseur()).toBe('3')
    expect(onValider).not.toHaveBeenCalled()
  })

  it('« Couper ici » valide d’un coup une coupe unique, sans étape « Valider »', () => {
    const { onValider, repondu } = monter('géographie', [3], GEO)
    fireEvent.click(screen.getByRole('button', { name: 'Une lettre vers la gauche' }))
    fireEvent.click(screen.getByRole('button', { name: 'Couper ici' }))
    expect(onValider).toHaveBeenCalledExactlyOnceWith([3])
    expect(repondu).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Bien vu.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Couper ici' })).toBeNull()
  })

  it('« Reprendre » n’existe que pour plusieurs coupes et retire la dernière, sans rien envoyer', () => {
    monter('géographie', [3], GEO)
    expect(screen.queryByRole('button', { name: 'Reprendre la dernière coupe' })).toBeNull()
  })

  it('un mot en trois morceaux demande deux coupes, jamais au même endroit', () => {
    const { onValider } = monter('autobiographie', [4, 7], AUTO)
    expect(screen.getByText('Coupe 1 sur 2. Glissez sur le mot.')).toBeInTheDocument()
    const lame = screen.getByRole('slider')
    lame.focus()
    // Au clavier : ← ×2 vers la jointure 4, Entrée pose la coupe.
    fireEvent.keyDown(lame, { key: 'ArrowLeft' })
    fireEvent.keyDown(lame, { key: 'ArrowLeft' })
    expect(curseur()).toBe('4')
    fireEvent.keyDown(lame, { key: 'Enter' })
    expect(screen.getByText('Coupe 2 sur 2. Glissez sur le mot.')).toBeInTheDocument()
    expect(curseur()).not.toBe('4')
    for (let i = 0; i < 10 && curseur() !== '7'; i++) fireEvent.keyDown(lame, { key: 'ArrowRight' })
    expect(curseur()).toBe('7')
    fireEvent.keyDown(lame, { key: 'Enter' })
    expect(onValider).toHaveBeenCalledExactlyOnceWith([4, 7])
  })

  it('avec deux coupes, « Reprendre » revient à la première et la seconde valide tout', () => {
    const { onValider } = monter('autobiographie', [4, 7], AUTO)
    const reprendre = screen.getByRole('button', { name: 'Reprendre la dernière coupe' })
    expect(reprendre).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Couper ici' }))
    expect(onValider).not.toHaveBeenCalled()
    expect(reprendre).toBeEnabled()
    fireEvent.click(reprendre)
    expect(screen.getByText('Coupe 1 sur 2. Glissez sur le mot.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Couper ici' }))
    fireEvent.click(screen.getByRole('button', { name: 'Couper ici' }))
    expect(onValider).toHaveBeenCalledTimes(1)
  })

  it('Retour arrière reprend la dernière coupe posée', () => {
    monter('autobiographie', [4, 7], AUTO)
    const lame = screen.getByRole('slider')
    fireEvent.keyDown(lame, { key: ' ' })
    expect(screen.getByText('Coupe 2 sur 2. Glissez sur le mot.')).toBeInTheDocument()
    fireEvent.keyDown(lame, { key: 'Backspace' })
    expect(screen.getByText('Coupe 1 sur 2. Glissez sur le mot.')).toBeInTheDocument()
  })

  it('une mauvaise découpe se lit sans nouvelle teinte : texte et rond barré, jamais de rouge', () => {
    const { onValider, pied } = monter('géographie', [3], GEO)
    fireEvent.click(screen.getByRole('button', { name: 'Couper ici' }))
    expect(onValider).toHaveBeenCalledWith([4])
    expect(screen.getByText('Pas cette fois.')).toBeInTheDocument()
    expect(document.querySelector('.rico-morceaux.faux')).not.toBeNull()
    expect(pied).toBeEmptyDOMElement()
  })
})

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePresence } from './presence'

describe('usePresence', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('compte le temps de jeu par paquets et signale une minute d\'inactivité', () => {
    const ajouter = vi.fn()
    const { result } = renderHook(() => usePresence(true, ajouter, 60_000))
    act(() => void vi.advanceTimersByTime(30_000))
    expect(ajouter).toHaveBeenCalledWith(30)
    expect(result.current).toBe(false)
    act(() => void vi.advanceTimersByTime(30_000))
    expect(result.current).toBe(true)
    act(() => void window.dispatchEvent(new Event('pointerdown')))
    expect(result.current).toBe(false)
  })

  it('ne compte rien tant qu\'il est inactif', () => {
    const ajouter = vi.fn()
    renderHook(() => usePresence(false, ajouter, 60_000))
    act(() => void vi.advanceTimersByTime(120_000))
    expect(ajouter).not.toHaveBeenCalled()
  })
})

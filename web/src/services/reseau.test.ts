import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DELAI_HORS_LIGNE_MS, REPONSE_LENTE_MS, Reseau } from './reseau'

describe('état du réseau (ADR 0085)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('passe instable sur un échec ou une réponse lente, puis revient en ligne', () => {
    const r = new Reseau(true)
    r.abonner(() => undefined)
    r.noterReussite(100)
    expect(r.lire().niveau).toBe('en_ligne')
    r.noterReussite(REPONSE_LENTE_MS + 1)
    expect(r.lire().niveau).toBe('instable')
    vi.advanceTimersByTime(30_000)
    expect(r.lire().niveau).toBe('en_ligne')
    r.noterEchec()
    expect(r.lire().niveau).toBe('instable')
  })

  it('une perte met hors ligne, la sonde ramène en ligne et l’annonce 2 s', async () => {
    const r = new Reseau(true)
    const sonde = vi.fn().mockRejectedValueOnce(new Error('coupé')).mockResolvedValue({})
    r.configurerSonde(sonde)
    r.abonner(() => undefined)
    r.noterPerte()
    expect(r.lire().niveau).toBe('hors_ligne')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(sonde).toHaveBeenCalledTimes(1)
    expect(r.lire().niveau).toBe('hors_ligne')
    // Second essai, plus tard (4 s) : il répond.
    await vi.advanceTimersByTimeAsync(4_000)
    expect(r.lire()).toEqual({ niveau: 'en_ligne', retour: true })
    vi.advanceTimersByTime(2_000)
    expect(r.lire()).toEqual({ niveau: 'en_ligne', retour: false })
  })

  it('ne passe hors ligne qu’après 2 s de coupure annoncée par le navigateur', () => {
    const r = new Reseau(true)
    r.abonner(() => undefined)
    const enLigne = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    vi.advanceTimersByTime(DELAI_HORS_LIGNE_MS - 1)
    expect(r.lire().niveau).toBe('en_ligne')
    // Micro-coupure : le réseau revient avant 2 s, rien ne bouge.
    enLigne.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    vi.advanceTimersByTime(DELAI_HORS_LIGNE_MS)
    expect(r.lire().niveau).toBe('en_ligne')
    enLigne.mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    vi.advanceTimersByTime(DELAI_HORS_LIGNE_MS)
    expect(r.lire().niveau).toBe('hors_ligne')
  })
})

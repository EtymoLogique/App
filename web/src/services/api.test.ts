import { describe, expect, it, vi } from 'vitest'

import { ClientApi, ErreurApi } from './api'
import { lireLiaison } from './reseau'

const PROFIL = { installation: '6f9619ff-8b86-4d11-b42d-00c04fc964ff', secret: 'a'.repeat(43) }

/** Relances immédiates : les tests n'attendent pas. */
const VITE = { delaiMs: 50, pausesMs: [0, 0], budgetMs: 1_000 }

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('client de l’API', () => {
  it('ouvre une session puis lit l’état avec le jeton', async () => {
    const expire = new Date(Date.now() + 15 * 60_000).toISOString()
    const appels = vi
      .fn()
      .mockResolvedValueOnce(json({ jeton: 'j1', expire_le: expire, nouveau: true }))
      .mockResolvedValueOnce(json({ version_etat: 0, version_catalogue: 'v1' }))
    vi.stubGlobal('fetch', appels)

    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL))
    expect(await client.etat()).toEqual({ version_etat: 0, version_catalogue: 'v1' })
    const [url, init] = appels.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('https://api.exemple.test/etat')
    expect(init.headers).toEqual({ Authorization: 'Bearer j1' })
    expect(init.credentials).toBe('omit')
  })

  it('transforme une panne réseau en erreur explicite, jamais en succès', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), VITE)
    await expect(client.etat()).rejects.toMatchObject({ code: 'reseau' })
    // Relances épuisées : l'API est injoignable jusqu'à ce qu'elle réponde de nouveau.
    expect(lireLiaison().joignable).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ statut: 'ok' })))
    expect(await client.reessayer()).toBe(true)
    expect(lireLiaison()).toEqual({ joignable: true, depuis: null })
  })

  it('relance une panne passagère avec la même commande', async () => {
    const appels = vi
      .fn()
      .mockResolvedValueOnce(json({ code: 'indisponible', message: 'base indisponible' }, 503))
      .mockResolvedValueOnce(new Response('passerelle', { status: 502 }))
      .mockResolvedValueOnce(json({ ok: true }))
    vi.stubGlobal('fetch', appels)
    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), VITE)
    expect(await client.ouvrirSession()).toEqual({ ok: true })
    const corps = appels.mock.calls.map(([, init]) => (init as RequestInit).body)
    expect(corps).toEqual([corps[0], corps[0], corps[0]])
  })

  it('abandonne un essai trop long, puis le relance', async () => {
    const pendue = (_: string, init: RequestInit) =>
      new Promise<Response>((_ok, echec) => init.signal?.addEventListener('abort', () => echec(init.signal?.reason)))
    const appels = vi.fn().mockImplementationOnce(pendue).mockResolvedValueOnce(json({ ok: true }))
    vi.stubGlobal('fetch', appels)
    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), VITE)
    expect(await client.ouvrirSession()).toEqual({ ok: true })
    expect(appels).toHaveBeenCalledTimes(2)
  })

  it('ne relance jamais un refus du serveur', async () => {
    const appels = vi.fn().mockResolvedValue(json({ code: 'conflit', message: 'version_etat périmée' }, 409))
    vi.stubGlobal('fetch', appels)
    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), VITE)
    await expect(client.ouvrirSession()).rejects.toMatchObject({ statut: 409 })
    expect(appels).toHaveBeenCalledTimes(1)
  })

  it('relaie le code d’erreur du serveur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 'trop_de_requetes', message: 'x' }, 429)))
    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL))
    const erreur = await client.ouvrirSession().catch((e: unknown) => e)
    expect(erreur).toBeInstanceOf(ErreurApi)
    expect(erreur).toMatchObject({ statut: 429, code: 'trop_de_requetes' })
  })
})

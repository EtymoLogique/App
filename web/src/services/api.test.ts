import { describe, expect, it, vi } from 'vitest'

import { ClientApi, ErreurApi } from './api'

const PROFIL = { installation: '6f9619ff-8b86-4d11-b42d-00c04fc964ff', secret: 'a'.repeat(43) }

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
    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL))
    await expect(client.etat()).rejects.toMatchObject({ code: 'reseau' })
  })

  it('relaie le code d’erreur du serveur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 'trop_de_requetes', message: 'x' }, 429)))
    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL))
    const erreur = await client.ouvrirSession().catch((e: unknown) => e)
    expect(erreur).toBeInstanceOf(ErreurApi)
    expect(erreur).toMatchObject({ statut: 429, code: 'trop_de_requetes' })
  })
})

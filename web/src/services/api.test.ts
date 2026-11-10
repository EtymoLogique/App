import { describe, expect, it, vi } from 'vitest'

import { ClientApi, ErreurApi } from './api'
import { Reseau } from './reseau'

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
    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), { delais: [], reseau: new Reseau() })
    await expect(client.etat()).rejects.toMatchObject({ code: 'reseau' })
  })

  it('relaie le code d’erreur du serveur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ code: 'trop_de_requetes', message: 'x' }, 429)))
    const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL))
    const erreur = await client.ouvrirSession().catch((e: unknown) => e)
    expect(erreur).toBeInstanceOf(ErreurApi)
    expect(erreur).toMatchObject({ statut: 429, code: 'trop_de_requetes' })
  })

  describe('réseau instable (ADR 0085)', () => {
    const expire = () => new Date(Date.now() + 15 * 60_000).toISOString()
    const rapide = (reseau = new Reseau()) => ({ delais: [1, 1, 1], delaiEssaiMs: 50, reseau })
    const demande = { commande: '6f9619ff-8b86-4d11-b42d-00c04fc964ff', version_etat: 1, version_catalogue: 'v1', briques: ['a', 'b'] }

    it('renvoie la même commande, même corps donc même clé, après une coupure', async () => {
      const appels = vi
        .fn()
        .mockResolvedValueOnce(json({ jeton: 'j1', expire_le: expire(), nouveau: false }))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(json({ code: 'interne', message: 'x' }, 502))
        .mockResolvedValueOnce(json({ issue: { type: 'echec' } }))
      vi.stubGlobal('fetch', appels)
      const reseau = new Reseau()
      const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), rapide(reseau))
      expect(await client.fusion(demande)).toEqual({ issue: { type: 'echec' } })
      const corps = appels.mock.calls.slice(1).map(([, init]) => (init as RequestInit).body)
      expect(corps).toHaveLength(3)
      expect(new Set(corps).size).toBe(1)
      expect(reseau.lire().niveau).toBe('instable')
    })

    it('abandonne un essai trop long, puis le renvoie', async () => {
      const appels = vi
        .fn()
        .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_, rejeter) => init.signal?.addEventListener('abort', () => rejeter(new DOMException('abort', 'AbortError')))))
        .mockResolvedValueOnce(json({ statut: 'ok' }))
      vi.stubGlobal('fetch', appels)
      const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), rapide())
      expect(await client.sante()).toEqual({ statut: 'ok' })
      expect(appels).toHaveBeenCalledTimes(2)
    })

    it('ne renvoie jamais une réponse du serveur : 409, 403, ni un 503 de l’API', async () => {
      for (const [statut, code] of [[409, 'conflit'], [403, 'interdit'], [503, 'indisponible']] as const) {
        const appels = vi.fn().mockResolvedValue(json({ code, message: 'x' }, statut))
        vi.stubGlobal('fetch', appels)
        const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), rapide())
        await expect(client.sante()).rejects.toMatchObject({ statut, code })
        expect(appels).toHaveBeenCalledTimes(1)
      }
    })

    it('renvoie un 429 seulement si l’attente demandée est courte', async () => {
      const appels = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'trop_de_requetes', message: 'x' }), { status: 429, headers: { 'Retry-After': '0' } }))
        .mockResolvedValueOnce(json({ statut: 'ok' }))
      vi.stubGlobal('fetch', appels)
      const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), rapide())
      expect(await client.sante()).toEqual({ statut: 'ok' })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'trop_de_requetes', message: 'x' }), { status: 429, headers: { 'Retry-After': '60' } })))
      await expect(client.sante()).rejects.toMatchObject({ statut: 429 })
    })

    it('met le réseau hors ligne quand les essais sont épuisés, mais pas pour une sonde', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      const reseau = new Reseau()
      const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), rapide(reseau))
      await expect(client.sonder()).rejects.toMatchObject({ code: 'reseau' })
      expect(reseau.lire().niveau).toBe('instable')
      await expect(client.sante()).rejects.toMatchObject({ code: 'reseau' })
      expect(reseau.lire().niveau).toBe('hors_ligne')
    })

    it('n’ouvre qu’une session pour deux appels simultanés', async () => {
      const appels = vi.fn((url: string) => Promise.resolve(url.endsWith('/session') ? json({ jeton: 'j1', expire_le: expire(), nouveau: false }) : json({ version_etat: 0 })))
      vi.stubGlobal('fetch', appels)
      const client = new ClientApi('https://api.exemple.test', () => Promise.resolve(PROFIL), rapide())
      await Promise.all([client.etat(), client.etat()])
      expect(appels.mock.calls.filter(([url]) => url.endsWith('/session'))).toHaveLength(1)
    })
  })
})

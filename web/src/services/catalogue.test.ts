import { describe, expect, it, vi } from 'vitest'

import { cheminValide, ErreurCatalogue, LecteurCatalogue } from './catalogue'

async function sha256(texte: string): Promise<string> {
  const octets = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte)))
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('')
}

const BASE = 'https://catalogue.exemple.test/public'

describe('catalogue', () => {
  it('ne suit que des chemins hachés de l’artefact', () => {
    const h = 'a'.repeat(64)
    expect(cheminValide(`f/${h}.json`)).toBe(true)
    expect(cheminValide(`a/${h}.svg`)).toBe(true)
    expect(cheminValide(`a/${h}.json`)).toBe(false)
    expect(cheminValide(`../f/${h}.json`)).toBe(false)
    expect(cheminValide('https://ailleurs.test/x.svg')).toBe(false)
    expect(() => new LecteurCatalogue(BASE).url('javascript:alert(1)')).toThrow(ErreurCatalogue)
  })

  it('renvoie null tant qu’aucun index n’est publié', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))
    expect(await new LecteurCatalogue(BASE).index()).toBeNull()
  })

  it('vérifie l’empreinte d’un manifeste', async () => {
    const contenu = JSON.stringify({ format: 1, numero: 0 })
    const chemin = `f/${await sha256(contenu)}.json`
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(contenu))))
    const lecteur = new LecteurCatalogue(BASE)
    await expect(lecteur.manifeste(chemin)).resolves.toMatchObject({ numero: 0 })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"format":1,"numero":1}')))
    await expect(lecteur.manifeste(chemin)).rejects.toThrow(/Empreinte/)
  })
})

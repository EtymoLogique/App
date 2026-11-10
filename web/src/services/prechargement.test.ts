import { describe, expect, it, vi } from 'vitest'

import { LecteurCatalogue } from './catalogue'
import type { CatalogueJeu } from './jeu'
import { mediasDuCatalogue, prechargerMedias } from './prechargement'
import { Reseau } from './reseau'

const h = (c: string) => c.repeat(64)
const jeu = {
  fascicules: [
    { manifeste: { jaquette: `a/${h('1')}.svg`, cartes: [{ silhouette: `a/${h('2')}.svg` }, { silhouette: null }], langues: [{ silhouette: `a/${h('2')}.svg` }] } },
    { manifeste: { jaquette: null, cartes: [{ silhouette: `a/${h('3')}.svg` }] } },
  ],
} as unknown as CatalogueJeu

describe('préchargement du catalogue (ADR 0085)', () => {
  it('liste chaque média une fois : jaquettes et silhouettes', () => {
    expect(mediasDuCatalogue(jeu).sort()).toEqual([`a/${h('1')}.svg`, `a/${h('2')}.svg`, `a/${h('3')}.svg`])
  })

  it('charge les médias en ligne, et rien sur un réseau instable', async () => {
    const appels = vi.fn().mockImplementation(() => Promise.resolve(new Response('<svg/>')))
    vi.stubGlobal('fetch', appels)
    const lecteur = new LecteurCatalogue('https://catalogue.exemple.test/public')
    expect(await prechargerMedias(jeu, lecteur, new Reseau(true))).toBe(3)
    const instable = new Reseau(true)
    instable.noterEchec()
    appels.mockClear()
    expect(await prechargerMedias(jeu, lecteur, instable)).toBe(0)
    expect(appels).not.toHaveBeenCalled()
  })
})

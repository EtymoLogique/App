import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { signalerJoignable } from '../services/reseau'

// Les `findBy*` et `waitFor` attendent 1 s par défaut : trop court quand les fichiers
// de test se disputent le processeur (CI, jsdom lancé en parallèle). On attend assez
// longtemps pour que la lenteur ne fasse pas échouer un test, sans masquer un vrai blocage.
configure({ asyncUtilTimeout: 5000 })

beforeEach(() => {
  // Aucun test ne touche le réseau. Un appel que le test n'a pas simulé échoue tout de suite par un 500,
  // qui n'est pas une panne passagère : sans cela, le vrai `fetch` rate, l'API épuise ses relances en
  // temps réel et passe `joignable` à faux, parfois pendant un autre test (l'état est global au module).
  vi.stubGlobal('fetch', async () => new Response('{"erreur":"appel non simulé par le test"}', { status: 500, headers: { 'content-type': 'application/json' } }))
})

afterEach(() => {
  cleanup()
  // Un test qui échoue avant son nettoyage ne lègue pas le mouvement réduit au suivant.
  delete document.documentElement.dataset.mouvement
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // La liaison avec l'API est un état du module : un test ne la lègue pas au suivant.
  signalerJoignable(true)
})

// jsdom n'a pas ResizeObserver (utilisé par les chevrons des fascicules).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

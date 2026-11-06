import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { signalerJoignable } from '../services/reseau'

afterEach(() => {
  cleanup()
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

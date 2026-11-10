import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { reseau } from '../services/reseau'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // L'état réseau est partagé : un test qui perd le réseau ne le perd pas pour les suivants.
  reseau.reinitialiser()
})

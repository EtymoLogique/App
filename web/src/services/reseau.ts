import { useSyncExternalStore } from 'react'

function abonner(rappel: () => void): () => void {
  window.addEventListener('online', rappel)
  window.addEventListener('offline', rappel)
  return () => {
    window.removeEventListener('online', rappel)
    window.removeEventListener('offline', rappel)
  }
}

/** Vrai tant que le navigateur se dit en ligne. */
export function useEnLigne(): boolean {
  return useSyncExternalStore(abonner, () => navigator.onLine)
}

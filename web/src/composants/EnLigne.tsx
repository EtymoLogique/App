import { useSyncExternalStore } from 'react'

function abonner(rappel: () => void): () => void {
  window.addEventListener('online', rappel)
  window.addEventListener('offline', rappel)
  return () => {
    window.removeEventListener('online', rappel)
    window.removeEventListener('offline', rappel)
  }
}

/** Indique l'état du réseau : hors connexion, la table se prépare mais rien ne se valide (ADR 0001). */
export function EnLigne() {
  const enLigne = useSyncExternalStore(abonner, () => navigator.onLine)
  return (
    <span className={enLigne ? 'pastille' : 'pastille hors-ligne'} role="status">
      {enLigne ? 'En ligne' : 'Hors connexion'}
    </span>
  )
}

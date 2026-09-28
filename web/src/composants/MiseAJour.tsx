import { useRegisterSW } from 'virtual:pwa-register/react'

/** Intervalle entre deux vérifications de la version déployée. */
const INTERVALLE_MS = 60_000

/**
 * Version déployée, version affichée (ADR 0037). À l’ouverture puis en continu, le navigateur relit
 * `sw.js` sur le CDN (servi `no-cache`, sans réveiller l'API mise à zéro) : toute
 * nouvelle version l'installe en attente, et l'écran bloque le jeu jusqu'à la
 * mise à jour. La table en cours vit dans IndexedDB et survit au rechargement.
 */
export function MiseAJour() {
  const {
    needRefresh: [aMettreAJour],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, enregistrement) {
      if (!enregistrement) return
      const verifier = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) enregistrement.update().catch(() => {})
      }
      verifier()
      setInterval(verifier, INTERVALLE_MS)
      document.addEventListener('visibilitychange', verifier)
      window.addEventListener('online', verifier)
    },
  })

  if (!aMettreAJour) return null
  return (
    <div className="scrim mise-a-jour" role="alertdialog" aria-modal="true" aria-labelledby="mise-a-jour-titre">
      <div className="dialogue">
        <h1 id="mise-a-jour-titre">Nouvelle version</h1>
        <p>Une nouvelle version d’ÉtymoLogique est disponible. Votre partie en cours est conservée.</p>
        <button type="button" className="btn btn-primary" autoFocus onClick={() => void updateServiceWorker(true)}>
          Mettre à jour
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'

import { useLiaison } from '../services/reseau'

/** Sous ce délai, rien ne s'affiche : une réponse rapide ne fait pas clignoter l'écran. */
const SEUIL_MS = 1_500
/** Au-delà, l'API ou la base sortent sans doute de veille : on le dit. */
const REVEIL_MS = 5_000

/** Pastille d'attente : un appel à l'API tarde (démarrage à froid, réseau lent). */
export function Attente() {
  const { depuis } = useLiaison()
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    if (depuis === null) return
    const minuteries = [SEUIL_MS, REVEIL_MS].map((seuil) => setTimeout(() => setMaintenant(Date.now()), Math.max(0, depuis + seuil - Date.now())))
    return () => minuteries.forEach(clearTimeout)
  }, [depuis])
  const ecoule = depuis === null ? 0 : maintenant - depuis
  const texte = ecoule >= REVEIL_MS ? 'Le serveur se réveille, encore quelques secondes…' : ecoule >= SEUIL_MS ? 'Connexion à l’atelier…' : null

  // La région vivante existe toujours : un lecteur d'écran annonce le texte qui y apparaît.
  return (
    <div className="attente" role="status">
      {texte && (
        <p className="attente-pastille">
          <span className="seal" aria-hidden="true">
            ÉL
          </span>
          {texte}
        </p>
      )}
    </div>
  )
}

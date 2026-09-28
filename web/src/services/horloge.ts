import { useEffect, useState } from 'react'

/** Instant courant, rafraîchi chaque seconde : l'énergie s'écoule à l'écran. */
export function useMaintenant(): number {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(minuterie)
  }, [])
  return maintenant
}

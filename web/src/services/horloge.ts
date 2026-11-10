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

/** « il y a 4 min » : depuis quand la partie est à jour. */
export function depuis(instant: number, maintenant: number): string {
  const minutes = Math.floor((maintenant - instant) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.floor(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  return `il y a ${Math.floor(heures / 24)} j`
}

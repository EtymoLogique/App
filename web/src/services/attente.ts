// Paliers d'attente d'une réponse du serveur (ADR 0085) : rien de plus pendant
// la première seconde, un signe discret ensuite, un mot après 4 s.

import { useEffect, useState } from 'react'

export const PALIER_1_MS = 1_000
export const PALIER_2_MS = 4_000

export type PalierAttente = 0 | 1 | 2

/** 0 pendant la première seconde d'attente, 1 ensuite, 2 après 4 s ; 0 dès que l'attente cesse. */
export function useAttente(actif: boolean): PalierAttente {
  const [palier, setPalier] = useState<PalierAttente>(0)
  useEffect(() => {
    if (!actif) return
    const premier = setTimeout(() => setPalier(1), PALIER_1_MS)
    const second = setTimeout(() => setPalier(2), PALIER_2_MS)
    return () => {
      clearTimeout(premier)
      clearTimeout(second)
      setPalier(0)
    }
  }, [actif])
  return actif ? palier : 0
}

// Préférences non sensibles, gardées sur l'appareil (ADR 0007) : thème et
// mouvement. Valeurs énumérées seulement, jamais de texte libre.

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'systeme' | 'atelier' | 'nocturne'
export type Mouvement = 'systeme' | 'reduit'

export interface Reglages {
  theme: Theme
  mouvement: Mouvement
}

const CLE = 'etymologique.reglages'
const DEFAUT: Reglages = { theme: 'systeme', mouvement: 'systeme' }

function lire(): Reglages {
  try {
    const valeur = JSON.parse(localStorage.getItem(CLE) ?? '{}') as Partial<Reglages>
    return {
      theme: valeur.theme === 'atelier' || valeur.theme === 'nocturne' ? valeur.theme : 'systeme',
      mouvement: valeur.mouvement === 'reduit' ? 'reduit' : 'systeme',
    }
  } catch {
    return DEFAUT
  }
}

/** Applique les réglages à la page : `data-theme` et `data-mouvement` sur `<html>`. */
export function appliquer(reglages: Reglages): void {
  const racine = document.documentElement
  if (reglages.theme === 'systeme') delete racine.dataset.theme
  else racine.dataset.theme = reglages.theme
  if (reglages.mouvement === 'reduit') racine.dataset.mouvement = 'reduit'
  else delete racine.dataset.mouvement
}

export function useReglages() {
  const [reglages, setReglages] = useState<Reglages>(lire)
  useEffect(() => appliquer(reglages), [reglages])
  const changer = useCallback((modif: Partial<Reglages>) => {
    setReglages((r) => {
      const suite = { ...r, ...modif }
      try {
        localStorage.setItem(CLE, JSON.stringify(suite))
      } catch {
        // Stockage indisponible : le réglage vaut pour la session.
      }
      return suite
    })
  }, [])
  return { reglages, changer }
}

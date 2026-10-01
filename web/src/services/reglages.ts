// Préférences non sensibles, gardées sur l'appareil (ADR 0007) : thème,
// mouvement, sons et vibrations. Valeurs énumérées seulement, jamais de texte libre.

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'systeme' | 'atelier' | 'nocturne'
export type Mouvement = 'systeme' | 'reduit'
export type Retours = 'actifs' | 'coupes'

export interface Reglages {
  theme: Theme
  mouvement: Mouvement
  /** Sons et vibrations (design système 2.4). */
  retours: Retours
}

const CLE = 'etymologique.reglages'
const DEFAUT: Reglages = { theme: 'atelier', mouvement: 'systeme', retours: 'actifs' }
const THEMES: readonly Theme[] = ['systeme', 'atelier', 'nocturne']

function lire(): Reglages {
  try {
    const valeur = JSON.parse(localStorage.getItem(CLE) ?? '{}') as Partial<Reglages>
    return {
      theme: valeur.theme && THEMES.includes(valeur.theme) ? valeur.theme : DEFAUT.theme,
      mouvement: valeur.mouvement === 'reduit' ? 'reduit' : 'systeme',
      retours: valeur.retours === 'coupes' ? 'coupes' : 'actifs',
    }
  } catch {
    return DEFAUT
  }
}

/** Applique les réglages à la page : `data-theme`, `data-mouvement` et `data-retours` sur `<html>`. */
export function appliquer(reglages: Reglages): void {
  const racine = document.documentElement
  if (reglages.theme === 'systeme') delete racine.dataset.theme
  else racine.dataset.theme = reglages.theme
  if (reglages.mouvement === 'reduit') racine.dataset.mouvement = 'reduit'
  else delete racine.dataset.mouvement
  if (reglages.retours === 'coupes') racine.dataset.retours = 'coupes'
  else delete racine.dataset.retours
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

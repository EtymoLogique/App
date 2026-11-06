import { useEffect, useRef, useState } from 'react'

/** Une interaction plus ancienne que cela : le joueur n'est plus devant l'écran, le temps ne compte plus. */
const ABSENCE_MS = 5 * 60_000
const PAS_MS = 5000
/** Le temps de jeu est remis à l'appelant par paquets, pour n'écrire qu'une fois par demi-minute. */
const PAQUET_S = 30

/**
 * Présence du joueur (ADR 0078) : compte son temps de jeu (onglet visible, interaction récente) et dit
 * s'il est resté `inactiviteMs` sans toucher l'écran. Aucune donnée ne quitte l'appareil.
 */
export function usePresence(actif: boolean, ajouterTemps: (secondes: number) => void, inactiviteMs: number): boolean {
  const [inactif, setInactif] = useState(false)
  const derniere = useRef(0)
  const cumul = useRef(0)
  const ajouter = useRef(ajouterTemps)
  useEffect(() => {
    ajouter.current = ajouterTemps
  })

  useEffect(() => {
    if (!actif) return
    derniere.current = Date.now()
    const vu = () => {
      derniere.current = Date.now()
      setInactif(false)
    }
    const vider = () => {
      if (cumul.current > 0) ajouter.current(cumul.current)
      cumul.current = 0
    }
    const pas = () => {
      const visible = document.visibilityState === 'visible'
      const depuis = Date.now() - derniere.current
      if (visible && depuis < ABSENCE_MS) {
        cumul.current += PAS_MS / 1000
        if (cumul.current >= PAQUET_S) vider()
      }
      setInactif(visible && depuis >= inactiviteMs)
    }
    const evenements = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const
    for (const e of evenements) window.addEventListener(e, vu, { passive: true })
    document.addEventListener('visibilitychange', vider)
    const minuterie = setInterval(pas, PAS_MS)
    return () => {
      clearInterval(minuterie)
      for (const e of evenements) window.removeEventListener(e, vu)
      document.removeEventListener('visibilitychange', vider)
      vider()
    }
  }, [actif, inactiviteMs])

  return inactif
}

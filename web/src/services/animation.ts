// Compteurs qui glissent vers leur nouvelle valeur quand le serveur la change
// (sabliers utilisés ou échangés), au lieu de sauter.

import { useEffect, useRef, useState } from 'react'

import type { EnergieEtat } from '../contrat'
import { avantPlein } from './plis'

const DUREE_MS = 900

export function mouvementReduit(): boolean {
  return document.documentElement.dataset.mouvement === 'reduit' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Valeur affichée : elle glisse vers `cible` quand celle-ci saute de plus de
 * `seuil`, et la suit sinon (le temps qui s'écoule seconde après seconde).
 * Une glissade en cours va jusqu'au bout, même si la cible bouge encore.
 */
export function useValeurAnimee(cible: number, seuil = 0): number {
  const [affichee, setAffichee] = useState(cible)
  const courante = useRef(cible)
  const enCours = useRef(false)
  useEffect(() => {
    const depart = courante.current
    if (Object.is(depart, cible)) return
    // Une valeur absente (NaN) est remplacée sans glisser : pas de défilement au chargement.
    if (Number.isNaN(depart) || Number.isNaN(cible) || (!enCours.current && Math.abs(cible - depart) <= seuil) || mouvementReduit()) {
      courante.current = cible
      setAffichee(cible)
      return
    }
    enCours.current = true
    const t0 = performance.now()
    let image = 0
    const pas = (t: number) => {
      const p = Math.min(1, (t - t0) / DUREE_MS)
      courante.current = depart + (cible - depart) * (1 - (1 - p) ** 3)
      setAffichee(courante.current)
      if (p < 1) image = requestAnimationFrame(pas)
      else enCours.current = false
    }
    image = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(image)
  }, [cible, seuil])
  return affichee
}

/** Énergie telle qu'elle reste pleine dans `reste` ms : le temps restant se lit comme d'habitude avec `energieA`. */
export function energieDepuisReste(energie: EnergieEtat, reste: number, maintenant: number): EnergieEtat {
  const recharge = energie.recharge_s * 1000
  if (reste <= 0) return { ...energie, charges: energie.capacite, prochaine_charge: null }
  const manquantes = Math.ceil(reste / recharge)
  return { ...energie, charges: energie.capacite - manquantes, prochaine_charge: new Date(maintenant + reste - (manquantes - 1) * recharge).toISOString() }
}

/**
 * Énergie dont le temps restant glisse quand des sabliers l'avancent ;
 * `avance` est vrai pendant la glissade (halo de la jauge).
 */
export function useEnergieAnimee<E extends EnergieEtat | undefined>(energie: E, maintenant: number): { energie: E; avance: boolean } {
  const reste = energie ? avantPlein(energie, maintenant) : Number.NaN
  // Au-delà de 5 s d'écart, ce n'est plus l'horloge : c'est une commande.
  const anime = useValeurAnimee(reste, 5000)
  const avance = energie !== undefined && !Number.isNaN(anime) && anime !== reste
  return { energie: avance ? (energieDepuisReste(energie, anime, maintenant) as E) : energie, avance }
}

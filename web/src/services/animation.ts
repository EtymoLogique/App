// Compteurs qui glissent vers leur nouvelle valeur quand le serveur la change
// (sabliers utilisés ou échangés), au lieu de sauter.

import { useEffect, useRef, useState } from 'react'

import type { EnergieEtat } from '../contrat'
import { avantPlein } from './plis'

/** Glissé court (480 ms), sans rebond final ni changement de couleur. */
const DUREE_MS = 480

/** Sortie douce, cubique. */
export const sortieDouce = (p: number) => 1 - (1 - p) ** 3

export function mouvementReduit(): boolean {
  return document.documentElement.dataset.mouvement === 'reduit' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Zone repliable (`<details>`) : la hauteur s'anime à l'ouverture et à la fermeture (240 ms), au rythme du chevron.
 * À brancher sur le `onClick` du `<summary>` ; sans animation possible, le comportement natif reste.
 */
export function basculer(e: { currentTarget: HTMLElement; preventDefault: () => void }): void {
  const details = e.currentTarget.parentElement
  if (!(details instanceof HTMLDetailsElement) || mouvementReduit() || typeof details.animate !== 'function') return
  e.preventDefault()
  const ouvre = !details.open || details.hasAttribute('data-ferme')
  const depart = details.offsetHeight
  details.getAnimations().forEach((a) => a.cancel())
  details.toggleAttribute('data-ferme', !ouvre)
  details.open = true
  if (!ouvre) {
    // Mesure de la hauteur fermée, puis retour à l'état ouvert le temps de l'animation.
    details.open = false
  }
  const arrivee = details.offsetHeight
  if (!ouvre) details.open = true
  details.style.overflow = 'hidden'
  const anim = details.animate({ height: [`${depart}px`, `${arrivee}px`] }, { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
  anim.onfinish = () => {
    details.style.overflow = ''
    if (!ouvre) {
      details.open = false
      details.removeAttribute('data-ferme')
    }
  }
  anim.oncancel = () => {
    details.style.overflow = ''
  }
}

/** Sons et vibrations : désactivables dans les réglages (design système 2.4), jamais sous le mouvement réduit. */
function retoursActifs(): boolean {
  return document.documentElement.dataset.retours !== 'coupes'
}

/** Vibration courte (Vibration API), là où l'appareil la permet. */
export function vibrer(motif: number | number[]): void {
  if (retoursActifs()) navigator.vibrate?.(motif)
}

let audio: AudioContext | undefined

/** Accord du légendaire : do, mi, sol, do, arpégés de 30 ms, une seconde, avec une longue vibration. */
export function accordLegendaire(): void {
  if (!retoursActifs()) return
  vibrer(400)
  try {
    audio ??= new AudioContext()
    const debut = audio.currentTime
    for (const [i, frequence] of [261.6, 329.6, 392, 523.3].entries()) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      const t = debut + i * 0.03
      osc.frequency.value = frequence
      gain.gain.setValueAtTime(0.1, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1)
      osc.connect(gain).connect(audio.destination)
      osc.start(t)
      osc.stop(t + 1)
    }
  } catch {
    // Pas de son disponible : la vibration et l'image suffisent.
  }
}

/**
 * Valeur affichée : elle glisse vers `cible` quand celle-ci saute de plus de
 * `seuil`, et la suit sinon (le temps qui s'écoule seconde après seconde).
 * Une glissade en cours va jusqu'au bout, même si la cible bouge encore.
 * `baisseSeule` : une hausse saute directement, sans glisser.
 */
export function useValeurAnimee(cible: number, seuil = 0, courbe: (p: number) => number = sortieDouce, baisseSeule = false): number {
  const [affichee, setAffichee] = useState(cible)
  const courante = useRef(cible)
  const enCours = useRef(false)
  useEffect(() => {
    const depart = courante.current
    if (Object.is(depart, cible)) return
    // Une valeur absente (NaN) est remplacée sans glisser : pas de défilement au chargement.
    if (Number.isNaN(depart) || Number.isNaN(cible) || (!enCours.current && Math.abs(cible - depart) <= seuil) || (baisseSeule && cible > depart) || mouvementReduit()) {
      enCours.current = false
      courante.current = cible
      setAffichee(cible)
      return
    }
    enCours.current = true
    const t0 = performance.now()
    let image = 0
    const pas = (t: number) => {
      // Le premier horodatage d'image peut précéder t0 : un p négatif ferait partir la glissade à l'envers.
      const p = Math.min(1, Math.max(0, (t - t0) / DUREE_MS))
      courante.current = depart + (cible - depart) * courbe(p)
      setAffichee(courante.current)
      if (p < 1) image = requestAnimationFrame(pas)
      else enCours.current = false
    }
    image = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(image)
    // La courbe est une constante du module : elle ne relance pas la glissade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
 * Énergie dont le temps restant glisse quand des sabliers l'avancent : la
 * jauge avance sans rebond, qui ferait clignoter un pli à la frontière d'une
 * charge ; `avance` est vrai pendant la glissade (traînée de la jauge). Un pli
 * ouvert fait remonter le temps restant d'un coup, sans glisser.
 */
const SEUIL_COMMANDE_MS = 5000

export function useEnergieAnimee<E extends EnergieEtat | undefined>(energie: E, maintenant: number): { energie: E; avance: boolean } {
  const reste = energie ? avantPlein(energie, maintenant) : Number.NaN
  // Au-delà de 5 s d'écart, ce n'est plus l'horloge : c'est une commande.
  const anime = useValeurAnimee(reste, SEUIL_COMMANDE_MS, sortieDouce, true)
  // La valeur affichée suit l'horloge avec un rendu de retard : en deçà du seuil, ce n'est pas une glissade.
  const avance = energie !== undefined && anime - reste > SEUIL_COMMANDE_MS
  return { energie: avance ? (energieDepuisReste(energie, anime, maintenant) as E) : energie, avance }
}

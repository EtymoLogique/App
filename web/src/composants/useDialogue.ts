import { useCallback, useEffect, useRef } from 'react'

import { mouvementReduit } from '../services/animation'

const FOCALISABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Fermeture d'une modale : sur mobile, la boîte redescend et le voile s'efface (240 ms), puis `onFermer`.
 * Ailleurs, ou sans mouvement, elle se ferme aussitôt. L'ouverture est en CSS (styles.css, `monte`).
 */
export function fermerVersLeBas(boite: HTMLElement | null, onFermer: () => void) {
  if (!boite || typeof boite.animate !== 'function' || mouvementReduit() || !window.matchMedia?.('(max-width: 760px)').matches) return onFermer()
  if (boite.dataset.sortie) return
  boite.dataset.sortie = '1'
  const options: KeyframeAnimationOptions = { duration: 240, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
  boite.parentElement?.querySelector('.scrim-fond')?.animate([{ opacity: 1 }, { opacity: 0 }], options)
  boite.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], options).finished.then(onFermer, onFermer)
}

/**
 * Comportement d'une modale : focus initial (l'élément `data-focus-initial`, sinon le premier),
 * focus piégé dans la boîte, `Échap` qui ferme, focus rendu au déclencheur à la fermeture.
 * Renvoie la référence à poser sur la boîte et la fermeture animée (`sortie`, fermerVersLeBas par défaut).
 */
export function useDialogue<T extends HTMLElement>(onFermer: () => void, sortie = fermerVersLeBas): [React.RefObject<T | null>, () => void] {
  const boite = useRef<T>(null)
  const fermer = useCallback(() => sortie(boite.current, onFermer), [onFermer, sortie])
  useEffect(() => {
    const declencheur = document.activeElement as HTMLElement | null
    const cibles = () => Array.from(boite.current?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? [])
    const depart = boite.current?.querySelector<HTMLElement>('[data-focus-initial]') ?? cibles()[0]
    depart?.focus({ preventScroll: true })
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return fermer()
      if (e.key !== 'Tab') return
      const liste = cibles()
      const premier = liste[0]
      const dernier = liste[liste.length - 1]
      if (!premier || !dernier) return
      const actif = document.activeElement
      if (!boite.current?.contains(actif)) {
        e.preventDefault()
        premier.focus()
      } else if (e.shiftKey && actif === premier) {
        e.preventDefault()
        dernier.focus()
      } else if (!e.shiftKey && actif === dernier) {
        e.preventDefault()
        premier.focus()
      }
    }
    window.addEventListener('keydown', touche)
    return () => {
      window.removeEventListener('keydown', touche)
      declencheur?.focus({ preventScroll: true })
    }
  }, [fermer])
  return [boite, fermer]
}

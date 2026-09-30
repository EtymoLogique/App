import { useEffect, useRef } from 'react'

const FOCALISABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Comportement d'une modale : focus initial (l'élément `data-focus-initial`, sinon le premier),
 * focus piégé dans la boîte, `Échap` qui ferme, focus rendu au déclencheur à la fermeture.
 * Renvoie la référence à poser sur la boîte.
 */
export function useDialogue<T extends HTMLElement>(onFermer: () => void) {
  const boite = useRef<T>(null)
  useEffect(() => {
    const declencheur = document.activeElement as HTMLElement | null
    const cibles = () => Array.from(boite.current?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? [])
    const depart = boite.current?.querySelector<HTMLElement>('[data-focus-initial]') ?? cibles()[0]
    depart?.focus({ preventScroll: true })
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onFermer()
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
  }, [onFermer])
  return boite
}

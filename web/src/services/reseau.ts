import { useSyncExternalStore } from 'react'

/**
 * Liaison avec l'API, tenue par `ClientApi` : le navigateur peut se dire en ligne
 * alors que l'API ne répond pas (démarrage à froid, réseau capricieux).
 */
export interface Liaison {
  /** Faux après un appel qui a épuisé ses relances, jusqu'à la prochaine réponse. */
  joignable: boolean
  /** Début de l'attente en cours (le plus ancien appel sans réponse), `null` sans appel en cours. */
  depuis: number | null
}

let liaison: Liaison = { joignable: true, depuis: null }
let enCours = 0
const abonnes = new Set<() => void>()

function changer(suite: Liaison): void {
  if (suite.joignable === liaison.joignable && suite.depuis === liaison.depuis) return
  liaison = suite
  abonnes.forEach((rappel) => rappel())
}

export function lireLiaison(): Liaison {
  return liaison
}

export function signalerJoignable(joignable: boolean): void {
  changer({ ...liaison, joignable })
}

/** Compte un appel en cours ; la fonction rendue le termine. */
export function commencerAppel(): () => void {
  enCours += 1
  if (enCours === 1) changer({ ...liaison, depuis: Date.now() })
  let fini = false
  return () => {
    if (fini) return
    fini = true
    enCours -= 1
    if (enCours === 0) changer({ ...liaison, depuis: null })
  }
}

function abonnerLiaison(rappel: () => void): () => void {
  abonnes.add(rappel)
  return () => abonnes.delete(rappel)
}

function abonnerNavigateur(rappel: () => void): () => void {
  window.addEventListener('online', rappel)
  window.addEventListener('offline', rappel)
  return () => {
    window.removeEventListener('online', rappel)
    window.removeEventListener('offline', rappel)
  }
}

export function useLiaison(): Liaison {
  return useSyncExternalStore(abonnerLiaison, lireLiaison)
}

/** État du réseau vu par le joueur : appareil hors ligne, ou API injoignable. */
export type EtatReseau = 'en_ligne' | 'hors_ligne' | 'injoignable'

export function useEtatReseau(): EtatReseau {
  const navigateur = useSyncExternalStore(abonnerNavigateur, () => navigator.onLine)
  const { joignable } = useLiaison()
  return !navigateur ? 'hors_ligne' : joignable ? 'en_ligne' : 'injoignable'
}

/** Vrai quand on peut jouer : appareil en ligne et API joignable (sinon consultation seule, ADR 0041). */
export function useEnLigne(): boolean {
  return useEtatReseau() === 'en_ligne'
}

// Adresse de l'écran dans l'URL, pour qu'un rechargement ou un lien ramène
// exactement au même endroit : onglet, filtres du codex et carte ouverte.
// Routes en fragment (#/codex/unt_…) : la PWA est servie en fichiers statiques,
// sans réécriture d'URL côté serveur.

import { useCallback, useSyncExternalStore } from 'react'

export type Onglet = 'table' | 'codex' | 'plis' | 'reglages'
export type FiltreCodex = 'tout' | 'mot' | 'prefixe' | 'suffixe' | 'langue'
export type TriCodex = 'n' | 'az' | 'type' | 'fasc'

export interface Route {
  onglet: Onglet
  /** Carte agrandie du codex. */
  carte: string | null
  filtre: FiltreCodex
  tri: TriCodex
  fascicule: number | null
}

const ONGLETS: Onglet[] = ['table', 'codex', 'plis', 'reglages']
const FILTRES: FiltreCodex[] = ['tout', 'mot', 'prefixe', 'suffixe', 'langue']
const TRIS: TriCodex[] = ['n', 'az', 'type', 'fasc']
const IDENTIFIANT = /^(unt|lng)_[0-9a-hjkmnp-tv-z]{8}$/

export const ROUTE_PAR_DEFAUT: Route = { onglet: 'table', carte: null, filtre: 'tout', tri: 'n', fascicule: null }

/** Lit une route ; toute valeur inconnue retombe sur sa valeur par défaut. */
export function lireRoute(fragment: string): Route {
  const [chemin = '', requete = ''] = fragment.replace(/^#\/?/, '').split('?')
  const [onglet, carte] = chemin.split('/')
  const params = new URLSearchParams(requete)
  const fascicule = Number(params.get('fascicule'))
  const route: Route = {
    onglet: ONGLETS.includes(onglet as Onglet) ? (onglet as Onglet) : 'table',
    carte: null,
    filtre: FILTRES.includes(params.get('type') as FiltreCodex) ? (params.get('type') as FiltreCodex) : 'tout',
    tri: TRIS.includes(params.get('tri') as TriCodex) ? (params.get('tri') as TriCodex) : 'n',
    fascicule: params.has('fascicule') && Number.isInteger(fascicule) && fascicule >= 0 ? fascicule : null,
  }
  if (route.onglet === 'codex' && carte && IDENTIFIANT.test(carte)) route.carte = carte
  return route
}

export function ecrireRoute(route: Route): string {
  if (route.onglet !== 'codex') return `#/${route.onglet}`
  const params = new URLSearchParams()
  if (route.filtre !== 'tout') params.set('type', route.filtre)
  if (route.tri !== 'n') params.set('tri', route.tri)
  if (route.fascicule !== null) params.set('fascicule', String(route.fascicule))
  const requete = params.toString()
  return `#/codex${route.carte ? `/${route.carte}` : ''}${requete ? `?${requete}` : ''}`
}

function abonner(rappel: () => void): () => void {
  window.addEventListener('hashchange', rappel)
  return () => window.removeEventListener('hashchange', rappel)
}

/**
 * Route courante et navigation. Changer d'onglet ou ouvrir une carte ajoute
 * une entrée à l'historique (le bouton Précédent y revient) ; changer un filtre
 * la remplace.
 */
export function useRoute(): [Route, (modif: Partial<Route>, options?: { remplacer?: boolean }) => void] {
  const fragment = useSyncExternalStore(abonner, () => window.location.hash)
  const route = lireRoute(fragment)
  const naviguer = useCallback((modif: Partial<Route>, options?: { remplacer?: boolean }) => {
    const suite = ecrireRoute({ ...lireRoute(window.location.hash), ...modif })
    if (suite === window.location.hash) return
    if (options?.remplacer) {
      history.replaceState(history.state, '', suite)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    } else {
      window.location.hash = suite
    }
  }, [])
  return [route, naviguer]
}

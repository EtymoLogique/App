// Adresse de l'écran dans l'URL, pour qu'un rechargement ou un lien ramène
// exactement au même endroit : onglet, vue et filtres du codex, carte ouverte.
// La recherche n'y figure pas : l'adresse ne porte jamais de texte (ADR 0034).
// Routes en fragment (#/codex/unt_…) : la PWA est servie en fichiers statiques,
// sans réécriture d'URL côté serveur.

import { useCallback, useSyncExternalStore } from 'react'

export type Onglet = 'table' | 'codex' | 'plis' | 'quetes' | 'boutique' | 'ricochets' | 'reglages'
export type FiltreCodex = 'tout' | 'mot' | 'prefixe' | 'suffixe' | 'langue'
export type TriCodex = 'n' | 'az' | 'type' | 'fasc'
/** Vues du codex (maquette I-14) ; les types se filtrent à part. */
export type VueCodex = 'tout' | 'recentes' | 'familles' | 'cabinet'
/** Onglets des quêtes (ADR 0042) : journalières, puis récompenses de fascicule. */
export type OngletQuetes = 'journalieres' | 'fascicules'

export interface Route {
  onglet: Onglet
  /** Carte agrandie du codex. */
  carte: string | null
  /** Fascicule dont l'atelier des plis est ouvert (#/plis/fsc_…). */
  pli: string | null
  /** Onglet des quêtes (#/quetes/fascicules) ; `null` : choisi selon les récompenses qui attendent. */
  quete: OngletQuetes | null
  /** Section « En savoir plus » dépliée sous la carte agrandie (I-16). */
  plus: boolean
  vue: VueCodex
  filtre: FiltreCodex
  tri: TriCodex
  /** Tri dans l'ordre inverse. */
  inverse: boolean
  /** Fascicule filtré, dans le codex comme dans les quêtes. */
  fascicule: number | null
}

const ONGLETS: Onglet[] = ['table', 'codex', 'plis', 'quetes', 'boutique', 'ricochets', 'reglages']
const QUETES: OngletQuetes[] = ['journalieres', 'fascicules']
const FILTRES: FiltreCodex[] = ['tout', 'mot', 'prefixe', 'suffixe', 'langue']
const TRIS: TriCodex[] = ['n', 'az', 'type', 'fasc']
const VUES: VueCodex[] = ['tout', 'recentes', 'familles', 'cabinet']
const IDENTIFIANT = /^(unt|lng)_[0-9a-hjkmnp-tv-z]{8}$/
const FASCICULE = /^fsc_[0-9a-hjkmnp-tv-z]{8}$/

export const ROUTE_PAR_DEFAUT: Route = { onglet: 'table', carte: null, pli: null, quete: null, plus: false, vue: 'tout', filtre: 'tout', tri: 'n', inverse: false, fascicule: null }

/** Lit une route ; toute valeur inconnue retombe sur sa valeur par défaut. */
export function lireRoute(fragment: string): Route {
  const [chemin = '', requete = ''] = fragment.replace(/^#\/?/, '').split('?')
  const [onglet, carte] = chemin.split('/')
  const params = new URLSearchParams(requete)
  const fascicule = Number(params.get('fascicule'))
  // « Objectifs » est devenu « Cabinet » (App#25) : les anciennes adresses y mènent.
  if (params.get('vue') === 'objectifs') params.set('vue', 'cabinet')
  const route: Route = {
    onglet: ONGLETS.includes(onglet as Onglet) ? (onglet as Onglet) : 'table',
    carte: null,
    pli: null,
    quete: null,
    plus: false,
    vue: VUES.includes(params.get('vue') as VueCodex) ? (params.get('vue') as VueCodex) : 'tout',
    filtre: FILTRES.includes(params.get('type') as FiltreCodex) ? (params.get('type') as FiltreCodex) : 'tout',
    tri: TRIS.includes(params.get('tri') as TriCodex) ? (params.get('tri') as TriCodex) : 'n',
    inverse: params.get('sens') === 'inverse',
    fascicule: params.has('fascicule') && Number.isInteger(fascicule) && fascicule >= 0 ? fascicule : null,
  }
  if (route.onglet === 'plis' && carte && FASCICULE.test(carte)) route.pli = carte
  if (route.onglet === 'quetes' && QUETES.includes(carte as OngletQuetes)) route.quete = carte as OngletQuetes
  if (route.onglet === 'codex' && carte && IDENTIFIANT.test(carte)) {
    route.carte = carte
    route.plus = params.get('plus') === '1'
  }
  return route
}

export function ecrireRoute(route: Route): string {
  if (route.onglet === 'plis') return `#/plis${route.pli ? `/${route.pli}` : ''}`
  if (route.onglet === 'quetes') {
    const fascicule = route.quete === 'fascicules' && route.fascicule !== null ? `?fascicule=${route.fascicule}` : ''
    return `#/quetes${route.quete ? `/${route.quete}` : ''}${fascicule}`
  }
  if (route.onglet !== 'codex') return `#/${route.onglet}`
  const params = new URLSearchParams()
  if (route.vue !== 'tout') params.set('vue', route.vue)
  if (route.filtre !== 'tout') params.set('type', route.filtre)
  if (route.tri !== 'n') params.set('tri', route.tri)
  if (route.inverse) params.set('sens', 'inverse')
  if (route.fascicule !== null) params.set('fascicule', String(route.fascicule))
  if (route.carte && route.plus) params.set('plus', '1')
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

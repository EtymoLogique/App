// Quêtes de fascicule (ADR 0038, 0042) : chaque jalon s'atteint à un nombre de
// mots du fascicule découverts ; sa récompense attend que le joueur vienne la
// récupérer. Le serveur fait foi : un jalon n'est « à récupérer » que s'il le
// dit atteint.

import type { Etat, Jalon } from '../contrat'
import type { CatalogueJeu, FasciculeParu } from './jeu'

export type EtatJalon = 'en_cours' | 'a_recuperer' | 'recupere'

export interface QueteJalon {
  jalon: Jalon
  fascicule: FasciculeParu
  /** Mots du fascicule découverts, bornés au seuil du jalon. */
  avancee: number
  etat: EtatJalon
}

/** Mots du fascicule découverts : ceux qui font avancer ses jalons, comme le compte le serveur. */
export function motsDecouverts(fascicule: FasciculeParu, etat: Etat | null): number {
  if (!etat) return 0
  const decouverts = new Set(etat.decouvertes.map((d) => d.mot_id))
  return (fascicule.manifeste.cartes ?? []).filter((c) => c.role === 'resultat' && decouverts.has(c.id)).length
}

/** Jalons des fascicules parus, dans l'ordre des fascicules puis des seuils. */
export function quetesDeFascicule(jeu: CatalogueJeu, etat: Etat | null): QueteJalon[] {
  const atteints = new Set(etat?.jalons_atteints ?? [])
  const recuperes = new Set(etat?.jalons_recuperes ?? [])
  return jeu.fascicules.flatMap((fascicule) => {
    const trouves = motsDecouverts(fascicule, etat)
    return (fascicule.manifeste.jalons ?? []).map((jalon) => ({
      jalon,
      fascicule,
      avancee: Math.min(trouves, jalon.decouvertes),
      etat: recuperes.has(jalon.id) ? 'recupere' : atteints.has(jalon.id) ? 'a_recuperer' : 'en_cours',
    }))
  })
}

/** Récompenses qui attendent le joueur : le compteur de la navigation. */
export function recompensesARecuperer(jeu: CatalogueJeu | null, etat: Etat | null): number {
  if (!jeu || !etat) return 0
  return quetesDeFascicule(jeu, etat).filter((q) => q.etat === 'a_recuperer').length
}

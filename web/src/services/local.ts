// Stockage local de la partie (ADR 0007) : la dernière projection confirmée
// de l'état et la table en cours. Jamais une source de vérité : au lancement,
// le serveur la remplace dès qu'il répond.

import { clear, createStore, get, set, type UseStore } from 'idb-keyval'

import type { Etat } from '../contrat'
import { TABLE_MAX } from './jeu'

let magasin: UseStore | undefined
function stockage(): UseStore {
  magasin ??= createStore('etymologique-partie', 'partie')
  return magasin
}

/**
 * Complète un état antérieur aux plis ou aux sabliers (projection locale ou
 * API pas encore à jour) : énergie inconnue, sans charge, jusqu'à une réponse complète.
 */
export function completerEtat(etat: Etat): Etat {
  return {
    ...etat,
    energie: etat.energie ?? { charges: 0, capacite: 2, prochaine_charge: null, recharge_s: 43_200 },
    encre: etat.encre ?? 0,
    compteurs_plis: etat.compteurs_plis ?? [],
    historique_plis: etat.historique_plis ?? [],
    sabliers: etat.sabliers ?? { detenus: 0, prix_gouttes: 10 },
    indices: etat.indices ?? [],
    jalons_atteints: etat.jalons_atteints ?? [],
    // Avant l'ADR 0042, un jalon atteint était accordé d'office : il est récupéré.
    jalons_recuperes: etat.jalons_recuperes ?? etat.jalons_atteints ?? [],
    prix_indices: etat.prix_indices ?? [],
    ricochets: etat.ricochets ?? [],
    ricochets_du_jour: etat.ricochets_du_jour ?? { reponses: 0, bonnes: 0 },
  }
}

export async function etatConfirme(): Promise<Etat | null> {
  const etat: unknown = await get('etat', stockage())
  if (typeof etat !== 'object' || etat === null) return null
  const { version_etat, reserve, decouvertes } = etat as Partial<Etat>
  if (typeof version_etat !== 'number' || !Array.isArray(reserve) || !Array.isArray(decouvertes)) return null
  return completerEtat(etat as Etat)
}

export function memoriserEtat(etat: Etat): Promise<void> {
  return set('etat', etat, stockage())
}

/** Cases de la table en cours, chacune à sa place (`null` pour une case vide). */
export async function tableEnCours(): Promise<(string | null)[]> {
  const table: unknown = await get('table', stockage())
  const valide = Array.isArray(table) && table.length <= TABLE_MAX && table.every((b) => b === null || typeof b === 'string')
  const cases: (string | null)[] = valide ? (table as (string | null)[]) : []
  return Array.from({ length: TABLE_MAX }, (_, i) => cases[i] ?? null)
}

export function memoriserTable(table: (string | null)[]): Promise<void> {
  return set('table', table, stockage())
}

/**
 * Fascicules débloqués que le joueur a déjà vus (ADR 0068) : les autres portent
 * la pastille « nouveau ». `null` tant que rien n'est mémorisé.
 */
export async function fasciculesConnus(): Promise<Set<string> | null> {
  try {
    const connus: unknown = await get('fascicules_connus', stockage())
    return Array.isArray(connus) && connus.every((f) => typeof f === 'string') ? new Set(connus) : null
  } catch {
    return null
  }
}

export function memoriserFasciculesConnus(connus: ReadonlySet<string>): Promise<void> {
  return set('fascicules_connus', [...connus], stockage()).catch(() => undefined)
}

/** Oublie la partie locale ; le serveur garde la progression confirmée. */
export function effacerPartie(): Promise<void> {
  return clear(stockage())
}

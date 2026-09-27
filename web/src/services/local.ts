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

export async function etatConfirme(): Promise<Etat | null> {
  const etat: unknown = await get('etat', stockage())
  if (typeof etat !== 'object' || etat === null) return null
  const { version_etat, reserve, decouvertes } = etat as Partial<Etat>
  return typeof version_etat === 'number' && Array.isArray(reserve) && Array.isArray(decouvertes) ? (etat as Etat) : null
}

export function memoriserEtat(etat: Etat): Promise<void> {
  return set('etat', etat, stockage())
}

export async function tableEnCours(): Promise<string[]> {
  const table: unknown = await get('table', stockage())
  return Array.isArray(table) && table.length <= TABLE_MAX && table.every((b) => typeof b === 'string') ? table : []
}

export function memoriserTable(table: string[]): Promise<void> {
  return set('table', table, stockage())
}

/** Oublie la partie locale ; le serveur garde la progression confirmée. */
export function effacerPartie(): Promise<void> {
  return clear(stockage())
}

// Indices à la carte (ADR 0051) : trois indices par recette, achetés dans
// l'ordre voulu, une fois chacun. Le serveur encaisse ; le contenu de chaque
// indice se lit dans le catalogue public, comme la prévisualisation d'une fusion.

import type { Etat } from '../contrat'
import type { EntreeCodex } from './codex'
import { type CatalogueJeu, type RecetteJeu, realisable } from './jeu'
import { sensLitteral } from './ricochets'

/** Numéro d'indice attendu par l'API (`niveau`), dans l'ordre du barème `prix_indices`. */
export const INDICES = [
  { niveau: 1, titre: 'Silhouette' },
  { niveau: 2, titre: 'Sens littéral' },
  { niveau: 3, titre: 'Définition' },
] as const

export interface ContenuIndice {
  /** Chemin haché de la silhouette, à lire dans le catalogue. */
  silhouette?: string
  texte?: string
}

/** Silhouettes à trouver qui peuvent recevoir un indice : jamais une légendaire (ADR 0015). */
export function ciblesIndice(jeu: CatalogueJeu, entrees: EntreeCodex[]): { entree: EntreeCodex; recette: RecetteJeu }[] {
  return entrees
    .filter((e) => e.resultat && !e.trouvee && !e.legendaire)
    .flatMap((entree) => {
      const recette = jeu.recettes.find((r) => r.motId === entree.id)
      return recette && indicesDisponibles(jeu, entree).length > 0 ? [{ entree, recette }] : []
    })
}

/**
 * Seul indice proposé : la silhouette déjà entamée (au moins un indice acheté) de plus petit n°,
 * sinon la plus petite que la réserve permet de former. Une silhouette entamée reste proposée
 * même quand de nouvelles briques ouvrent un n° plus petit.
 */
export function indiceCourant(jeu: CatalogueJeu, entrees: EntreeCodex[], etat: Etat | null): { entree: EntreeCodex; recette: RecetteJeu } | null {
  const cibles = ciblesIndice(jeu, entrees).sort((a, b) => a.entree.n - b.entree.n)
  return cibles.find((c) => indicesObtenus(etat, c.recette.id).size > 0) ?? cibles.find((c) => realisable(c.recette, etat?.reserve ?? [])) ?? null
}

/** Indices déjà obtenus pour une recette. */
export function indicesObtenus(etat: Etat | null, recette: string): Set<number> {
  return new Set((etat?.indices ?? []).filter((i) => i.recette_id === recette).map((i) => i.niveau))
}

/** Contenu d'un indice, lu dans le catalogue ; `null` quand la fiche de la carte ne le porte pas. */
export function contenuIndice(jeu: CatalogueJeu, entree: EntreeCodex, niveau: number): ContenuIndice | null {
  switch (niveau) {
    case 1:
      return entree.silhouette ? { silhouette: entree.silhouette } : null
    case 2: {
      const sens = sensLitteral(jeu, entree.id)
      return sens ? { texte: sens } : null
    }
    case 3:
      return entree.definition ? { texte: entree.definition } : null
    default:
      return null
  }
}

/** Numéros des indices qu'une carte peut vendre : on ne vend jamais un indice vide. */
export function indicesDisponibles(jeu: CatalogueJeu, entree: EntreeCodex): number[] {
  return INDICES.filter((i) => contenuIndice(jeu, entree, i.niveau) !== null).map((i) => i.niveau)
}

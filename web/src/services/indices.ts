// Indices (ADR 0038) : cinq niveaux par recette, achetés dans l'ordre. Le
// serveur encaisse ; le contenu de chaque niveau se lit dans le catalogue
// public, comme la prévisualisation d'une fusion.

import type { Etat } from '../contrat'
import type { EntreeCodex } from './codex'
import { type BriqueJeu, type CatalogueJeu, NATURES, type RecetteJeu } from './jeu'

export const TITRES_INDICES = ['Langue du résultat', 'Nature des briques', 'Une transformation ?', 'Une brique connue', 'La solution'] as const

const RANGS = ['1ʳᵉ', '2ᵉ']

/** Silhouettes à trouver qui peuvent recevoir un indice : jamais une légendaire (ADR 0015). */
export function ciblesIndice(jeu: CatalogueJeu, entrees: EntreeCodex[]): { entree: EntreeCodex; recette: RecetteJeu }[] {
  return entrees
    .filter((e) => e.resultat && !e.trouvee && !e.legendaire)
    .flatMap((entree) => {
      const recette = jeu.recettes.find((r) => r.motId === entree.id)
      return recette ? [{ entree, recette }] : []
    })
}

/** Niveau déjà obtenu pour une recette, 0 si aucun. */
export function niveauObtenu(etat: Etat | null, recette: string): number {
  return Math.max(0, ...(etat?.indices ?? []).filter((i) => i.recette_id === recette).map((i) => i.niveau))
}

/** Morceaux d'un indice : du texte, ou une brique à afficher comme brique, jamais en texte brut. */
export type PartieIndice = string | BriqueJeu

/** Contenu d'un niveau d'indice, lu dans le catalogue. */
export function contenuIndice(jeu: CatalogueJeu, recette: RecetteJeu, niveau: number, etat: Etat | null): PartieIndice[] {
  const carte = jeu.cartes.get(recette.motId)
  const briques = recette.emplacements.map((e) => jeu.briques.get(e[0] ?? ''))
  switch (niveau) {
    case 1:
      return [(carte && jeu.langues.get(carte.langue_id)) ?? 'Langue inconnue']
    case 2:
      return [briques.map((b) => (b ? NATURES[b.nature] : '?')).join(' + ')]
    case 3: {
      const compositions = carte?.compositions ?? []
      const composition = compositions.find((c) => c.preferee) ?? compositions[0]
      const noms = (composition?.transformations ?? []).map((t) => jeu.typesTransformation.get(t.type_code) ?? t.type_code)
      return [noms.length > 0 ? `Oui : ${noms.join(', ')}` : 'Aucune transformation']
    }
    case 4: {
      const detenues = new Set((etat?.reserve ?? []).map((e) => e.brique_id))
      const rang = recette.emplacements.findIndex((e) => e.some((b) => detenues.has(b)))
      const brique = jeu.briques.get(recette.emplacements[rang]?.find((b) => detenues.has(b)) ?? '')
      return brique ? [brique, ` en ${RANGS[rang] ?? `${rang + 1}ᵉ`} position`] : ['Aucune brique de votre réserve']
    }
    default:
      return briques.flatMap((b, i) => [...(i > 0 ? [' + '] : []), b ?? '?'])
  }
}

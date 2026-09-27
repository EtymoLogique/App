// Le jeu côté client : catalogue des fascicules parus, briques affichables et
// prévisualisation d'une fusion. Le serveur fait foi (ADR 0007, ADR 0027) :
// la prévisualisation n'est qu'une réponse immédiate, démentie au besoin.

import type { Calendrier, Carte, Exclusions, Forme, Manifeste, MotifPresque, Recette } from '../contrat'
import type { LecteurCatalogue } from './catalogue'

/** Taille de la table de fusion, comme `TABLE_MIN` et `TABLE_MAX` de l'API. */
export const TABLE_MIN = 2
export const TABLE_MAX = 4
/** Plafond d'exemplaires par brique (ADR 0012). */
export const PLAFOND = 5

export interface FasciculeParu {
  numero: number
  parution: string
  manifeste: Manifeste
}

/** Une brique telle qu'on l'affiche : jamais en texte brut (game-design). */
export interface BriqueJeu {
  id: string
  uniteId: string
  nature: Carte['nature']
  forme: string
  glose: string | null
  langue: string | null
  origine: string | null
}

export interface RecetteJeu {
  id: string
  motId: string
  emplacements: string[][]
}

export interface CatalogueJeu {
  version: string
  fascicules: FasciculeParu[]
  cartes: Map<string, Carte>
  briques: Map<string, BriqueJeu>
  recettes: RecetteJeu[]
  exclusions: { combinaison: string[]; raison: string }[]
  langues: Map<string, string>
}

export type Prevision =
  | { type: 'decouverte' | 'connue'; recette_id: string; mot_id: string }
  | { type: 'exclue'; raison: string }
  | { type: 'presque'; motif: MotifPresque }
  | { type: 'echec' }

function decoder<T>(octets: ArrayBuffer): T {
  return JSON.parse(new TextDecoder().decode(octets)) as T
}

function nomsDesLangues(index: Calendrier): Map<string, string> {
  const noms = new Map<string, string>()
  const referentiels = index.referentiels as { langues?: { id?: unknown; libelles?: { fr?: { nom?: unknown } } }[] }
  for (const langue of referentiels?.langues ?? []) {
    const nom = langue.libelles?.fr?.nom
    if (typeof langue.id === 'string' && typeof nom === 'string') noms.set(langue.id, nom)
  }
  return noms
}

export function formeCanonique(carte: Carte): Forme | undefined {
  return carte.formes.find((f) => f.role === 'canonique') ?? carte.formes[0]
}

export function texteDuMot(carte: Carte | undefined): string {
  return (carte && formeCanonique(carte)?.texte) ?? '…'
}

export function definition(carte: Carte): string | null {
  const sens = [...carte.sens].sort((a, b) => a.rang - b.rang)
  return sens.map((s) => s.libelles.fr?.definition).find((d) => d) ?? null
}

function brique(carte: Carte, langues: Map<string, string>): BriqueJeu | null {
  if (!carte.brique) return null
  const forme = carte.formes.find((f) => f.id === carte.brique?.forme_affichee_id) ?? formeCanonique(carte)
  const sens = carte.sens.find((s) => s.id === carte.brique?.sens_affiche_id)
  const etymon = carte.relations?.find((r) => r.etymon)?.etymon
  let origine: string | null = null
  if (etymon) {
    const langue = langues.get(etymon.langue_id)
    const translitteration = etymon.forme.translitterations?.[0]?.texte
    const glose = etymon.sens?.[0]?.libelles.fr?.glose
    origine = [
      langue ? (/^[aeiouéèêh]/i.test(langue) ? `de l’${langue}` : `du ${langue}`) : null,
      etymon.forme.texte + (translitteration ? ` (${translitteration})` : ''),
      glose ? `« ${glose} »` : null,
    ]
      .filter(Boolean)
      .join(' ')
  }
  return {
    id: carte.brique.id,
    uniteId: carte.id,
    nature: carte.nature,
    forme: forme?.texte ?? '…',
    glose: sens?.libelles.fr?.glose ?? null,
    langue: langues.get(carte.langue_id) ?? null,
    origine,
  }
}

/** Charge tout ce qu'il faut pour jouer aux fascicules parus. */
export async function chargerJeu(lecteur: LecteurCatalogue): Promise<CatalogueJeu | null> {
  const index = await lecteur.index()
  if (!index) return null
  const langues = nomsDesLangues(index)
  const jeu: CatalogueJeu = {
    version: index.version,
    fascicules: [],
    cartes: new Map(),
    briques: new Map(),
    recettes: [],
    exclusions: [],
    langues,
  }
  for (const entree of index.fascicules) {
    const manifeste = await lecteur.manifeste(entree.manifeste)
    jeu.fascicules.push({ numero: entree.numero, parution: entree.parution, manifeste })
    const [cartes, recettes, exclusions] = await Promise.all([
      Promise.all((manifeste.cartes ?? []).map(async (c) => decoder<Carte>(await lecteur.fichierHache(c.carte)))),
      Promise.all((manifeste.recettes ?? []).map(async (r) => decoder<Recette>(await lecteur.fichierHache(r.chemin)))),
      manifeste.exclusions ? lecteur.fichierHache(manifeste.exclusions).then((o) => decoder<Exclusions>(o)) : null,
    ])
    for (const carte of cartes) {
      jeu.cartes.set(carte.id, carte)
      const b = brique(carte, langues)
      if (b) jeu.briques.set(b.id, b)
    }
    for (const recette of recettes) {
      const emplacements = [...recette.emplacements].sort((a, b) => a.rang - b.rang).map((e) => e.briques_acceptees)
      jeu.recettes.push({ id: recette.id, motId: recette.resultat_id, emplacements })
    }
    for (const e of exclusions?.exclusions ?? []) jeu.exclusions.push({ combinaison: e.combinaison, raison: e.raison })
  }
  return jeu
}

function exacte(proposition: string[], recette: RecetteJeu): boolean {
  return (
    proposition.length === recette.emplacements.length &&
    proposition.every((b, i) => recette.emplacements[i]?.includes(b) ?? false)
  )
}

function couvre(proposition: string[], recette: RecetteJeu): boolean {
  const pris = recette.emplacements.map(() => false)
  const apparier = (i: number): boolean => {
    if (i === proposition.length) return true
    const brique = proposition[i] as string
    for (let j = 0; j < recette.emplacements.length; j++) {
      if (!pris[j] && recette.emplacements[j]?.includes(brique)) {
        pris[j] = true
        if (apparier(i + 1)) return true
        pris[j] = false
      }
    }
    return false
  }
  return proposition.length <= recette.emplacements.length && apparier(0)
}

/** Miroir de `etymo_domaine::fusion::resoudre` : mêmes règles, même ordre. */
export function prevoir(proposition: string[], jeu: CatalogueJeu, decouverts: Set<string>): Prevision {
  const recette = jeu.recettes.find((r) => exacte(proposition, r))
  if (recette) {
    return { type: decouverts.has(recette.motId) ? 'connue' : 'decouverte', recette_id: recette.id, mot_id: recette.motId }
  }
  const exclusion = jeu.exclusions.find(
    (e) => e.combinaison.length === proposition.length && e.combinaison.every((b, i) => b === proposition[i]),
  )
  if (exclusion) return { type: 'exclue', raison: exclusion.raison }
  const aDecouvrir = jeu.recettes.filter((r) => !decouverts.has(r.motId))
  if (aDecouvrir.some((r) => r.emplacements.length === proposition.length && couvre(proposition, r))) {
    return { type: 'presque', motif: 'ordre' }
  }
  if (aDecouvrir.some((r) => r.emplacements.length > proposition.length && couvre(proposition, r))) {
    return { type: 'presque', motif: 'incomplet' }
  }
  return { type: 'echec' }
}

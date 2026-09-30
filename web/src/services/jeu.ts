// Le jeu côté client : catalogue des fascicules parus, briques affichables et
// prévisualisation d'une fusion. Le serveur fait foi (ADR 0007, ADR 0027) :
// la prévisualisation n'est qu'une réponse immédiate, démentie au besoin.

import type { Calendrier, Carte, Exclusions, Forme, Manifeste, MotifPresque, Rarete, Recette } from '../contrat'
import type { LecteurCatalogue } from './catalogue'

/** La table accepte exactement deux briques, comme `TABLE_MIN` et `TABLE_MAX` de l'API. */
export const TABLE_MIN = 2
export const TABLE_MAX = 2
/** Plafond d'exemplaires par brique (ADR 0012). */
export const PLAFOND = 5

export interface FasciculeParu {
  numero: number
  parution: string
  manifeste: Manifeste
}

export type { Rarete }

/** « Fascicule Rosette, n° 1 » pour un lecteur d'écran ; « Fascicule n° 1 » s'il n'a pas de nom. */
export function libelleFascicule(fascicule: { numero: number; manifeste: Manifeste }): string {
  const nom = fascicule.manifeste.nom
  return nom ? `Fascicule ${nom}, n°\u00a0${fascicule.numero}` : `Fascicule n°\u00a0${fascicule.numero}`
}

/** Une brique telle qu'on l'affiche : jamais en texte brut (game-design). */
export interface BriqueJeu {
  id: string
  uniteId: string
  nature: Carte['nature']
  forme: string
  /** Forme affichée, avec le trait d'union qui dit sa position : « géo- », « -logie ». */
  libelle: string
  rarete: Rarete
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
  /** Lettre emblème de chaque carte de langue (É, Æ, Ω…), éditée dans Content. */
  glyphes: Map<string, string>
  /** Noms des types de relation et de transformation, par code (« forme de composition », « élision »). */
  typesRelation: Map<string, string>
  typesTransformation: Map<string, string>
}

export type Prevision =
  | { type: 'decouverte' | 'connue'; recette_id: string; mot_id: string }
  | { type: 'exclue'; raison: string }
  | { type: 'presque'; motif: MotifPresque }
  | { type: 'echec' }

function decoder<T>(octets: ArrayBuffer): T {
  return JSON.parse(new TextDecoder().decode(octets)) as T
}

type LangueIndex = { id?: unknown; glyphe?: unknown; libelles?: { fr?: { nom?: unknown } } }

function languesDe(index: Calendrier): LangueIndex[] {
  return (index.referentiels as { langues?: LangueIndex[] } | undefined)?.langues ?? []
}

function nomsDesLangues(index: Calendrier): Map<string, string> {
  const noms = new Map<string, string>()
  for (const langue of languesDe(index)) {
    const nom = langue.libelles?.fr?.nom
    if (typeof langue.id === 'string' && typeof nom === 'string') noms.set(langue.id, nom)
  }
  return noms
}

function glyphesDesLangues(index: Calendrier): Map<string, string> {
  const glyphes = new Map<string, string>()
  for (const langue of languesDe(index)) {
    if (typeof langue.id === 'string' && typeof langue.glyphe === 'string') glyphes.set(langue.id, langue.glyphe)
  }
  return glyphes
}

type TypeIndex = { code?: unknown; libelles?: { fr?: { nom?: unknown } } }

function nomsDesTypes(index: Calendrier, cle: 'types_relation' | 'types_transformation'): Map<string, string> {
  const noms = new Map<string, string>()
  for (const type of (index.referentiels as Record<string, TypeIndex[] | undefined> | undefined)?.[cle] ?? []) {
    const nom = type.libelles?.fr?.nom
    if (typeof type.code === 'string' && typeof nom === 'string') noms.set(type.code, nom)
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

export function libelle(nature: Carte['nature'], forme: string): string {
  return nature === 'prefixe' ? `${forme}-` : nature === 'suffixe' ? `-${forme}` : forme
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
    libelle: libelle(carte.nature, forme?.texte ?? '…'),
    rarete: carte.brique.rarete,
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
    glyphes: glyphesDesLangues(index),
    typesRelation: nomsDesTypes(index, 'types_relation'),
    typesTransformation: nomsDesTypes(index, 'types_transformation'),
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

const RANGS: Record<Rarete, number> = { commune: 0, peu_commune: 1, rare: 2, legendaire: 3 }
const plusRare = (a: Rarete, b: Rarete): Rarete => (RANGS[a] >= RANGS[b] ? a : b)
const moinsRare = (a: Rarete, b: Rarete): Rarete => (RANGS[a] <= RANGS[b] ? a : b)

/**
 * Rareté d'un mot (ADR 0040), miroir de `etymo_domaine::pli::rarete_mot` : la
 * plus haute rareté des briques qu'exige sa recette la plus accessible. Pour
 * un emplacement à variantes, la moins rare compte. Seuls les affixes ont une
 * rareté publiée au pli ; un mot posé tel quel compte comme commun.
 */
export function rareteMot(motId: string, jeu: Pick<CatalogueJeu, 'recettes' | 'briques'>): Rarete {
  const de = (id: string): Rarete => {
    const brique = jeu.briques.get(id)
    return brique && brique.nature !== 'mot' ? brique.rarete : 'commune'
  }
  const recettes = jeu.recettes.filter((r) => r.motId === motId)
  if (recettes.length === 0) return 'commune'
  return recettes
    .map((r) => r.emplacements.map((e) => (e.length === 0 ? 'commune' : e.map(de).reduce(moinsRare))).reduce(plusRare, 'commune'))
    .reduce(moinsRare)
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

/** Mots des fascicules parus, d'après leurs compteurs : hors légendaires, qui ne se trahissent jamais (ADR 0015). */
export function totalMots(jeu: CatalogueJeu): number {
  return jeu.fascicules.reduce((n, f) => {
    const mots = (f.manifeste.compteurs as { mots?: unknown } | undefined)?.mots
    return n + (typeof mots === 'number' ? mots : 0)
  }, 0)
}

export const NATURES: Record<BriqueJeu['nature'], string> = { prefixe: 'préfixe', suffixe: 'suffixe', mot: 'mot' }

/** Libellé accessible d'une brique : « préfixe géo- (terre) ». */
export function nomAccessible(brique: BriqueJeu): string {
  return `${NATURES[brique.nature]} ${brique.libelle}${brique.glose ? ` (${brique.glose})` : ''}`
}

/**
 * Vrai si la réserve permet encore au moins une découverte : une recette d'un
 * mot inconnu dont chaque emplacement trouve un exemplaire (game-design,
 * « Réserve sans découverte possible »).
 */
export function decouvertePossible(jeu: CatalogueJeu, reserve: { brique_id: string; exemplaires: number }[], decouverts: Set<string>): boolean {
  return jeu.recettes.some((recette) => !decouverts.has(recette.motId) && realisable(recette, reserve))
}

/** Vrai si la réserve a de quoi remplir chaque emplacement de la recette, un exemplaire par emplacement. */
export function realisable(recette: RecetteJeu, reserve: { brique_id: string; exemplaires: number }[]): boolean {
  const restants = new Map(reserve.map((e) => [e.brique_id, e.exemplaires]))
  return recette.emplacements.every((acceptees) => {
    const brique = acceptees.find((b) => (restants.get(b) ?? 0) > 0)
    if (!brique) return false
    restants.set(brique, (restants.get(brique) ?? 0) - 1)
    return true
  })
}

/** Longue, courte, longue, courte… : chaque ligne du plateau marie une grande brique et une petite. */
export function entrelacer<T>(elements: T[], taille: (e: T) => number): T[] {
  const tries = [...elements].sort((a, b) => taille(b) - taille(a))
  const suite: T[] = []
  for (let i = 0, j = tries.length - 1; i <= j; i++, j--) {
    suite.push(tries[i] as T)
    if (i !== j) suite.push(tries[j] as T)
  }
  return suite
}

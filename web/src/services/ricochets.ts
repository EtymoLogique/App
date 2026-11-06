// Ricochets (ADR 0044) : de quoi poser et juger une question depuis le catalogue,
// qui est public. Le verdict s'affiche aussitôt ; le serveur fait foi pour le
// niveau, la maîtrise et les quêtes. Miroir de `juger` (crates/api/src/ricochets.rs).

import type { CarteRicochet, QuestionRicochet } from '../contrat'
import { type BriqueJeu, type CatalogueJeu, texteDuMot } from './jeu'

export type FormatRicochet = QuestionRicochet['format']

/** Réponse d'un joueur : un choix, ou les positions de coupe d'un mot. */
export type ReponseJoueur = string | number[]

interface BriqueRicochet {
  sens: string
  classe: string
}

/** Un morceau du mot et ses coupes justes (ADR 0084) : des positions dans le mot entier. */
export interface NoeudCoupes {
  debut: number
  fin: number
  coupes: number[]
  parties?: NoeudCoupes[]
}

/** Ce que valent les coupes posées : `faux` arrête la question, `termine` l'achève. */
export type VerdictCoupes = 'faux' | 'continue' | 'termine'

export interface DonneesRicochets {
  briques: Map<string, BriqueRicochet>
  /** Classe du sens littéral, coupes de premier niveau et arbre des coupes (ADR 0084), par mot. */
  mots: Map<string, { classe: string | null; coupes: number[]; decoupage?: NoeudCoupes | null }>
  /** Glose de chaque sens affiché d'une brique. */
  gloses: Map<string, string>
}

export function donneesRicochets(jeu: CatalogueJeu): DonneesRicochets {
  const donnees: DonneesRicochets = { briques: new Map(), mots: new Map(), gloses: new Map() }
  for (const { manifeste } of jeu.fascicules) {
    for (const b of manifeste.ricochets?.briques ?? []) {
      donnees.briques.set(b.id, { sens: b.sens_id, classe: b.classe_sens })
      const glose = jeu.briques.get(b.id)?.glose
      if (glose) donnees.gloses.set(b.sens_id, glose)
    }
    for (const m of manifeste.ricochets?.mots ?? []) donnees.mots.set(m.id, { classe: m.classe_litteral ?? null, coupes: m.coupes ?? [], decoupage: m.decoupage ?? null })
  }
  return donnees
}

/** Sens littéral d'un mot, dans sa composition préférée. */
export function sensLitteral(jeu: CatalogueJeu, motId: string): string | null {
  const compositions = jeu.cartes.get(motId)?.compositions ?? []
  const choisie = compositions.find((c) => c.preferee) ?? compositions[0]
  return choisie?.libelles.fr?.sens_litteral ?? null
}

/** Arbre à juger : le `decoupage` publié, ou à défaut les `coupes` du premier niveau (manifeste antérieur). */
export function arbreDuMot(d: DonneesRicochets, unite: string): NoeudCoupes | null {
  const mot = d.mots.get(unite)
  if (!mot) return null
  if (mot.decoupage) return mot.decoupage
  return mot.coupes.length ? { debut: 0, fin: Number.POSITIVE_INFINITY, coupes: [...new Set(mot.coupes)].sort((a, b) => a - b) } : null
}

function rassembler(n: NoeudCoupes, tous: NoeudCoupes[] = []): NoeudCoupes[] {
  tous.push(n)
  for (const p of n.parties ?? []) rassembler(p, tous)
  return tous
}

/**
 * Juge l'ensemble des coupes posées, quel que soit leur ordre. Miroir de
 * `etymo_domaine::decoupage::juger` : changez les deux ensemble, avec leurs tests.
 * Une coupe est juste si un nœud la porte et si ses deux bords sont des bords du mot
 * ou des coupes déjà posées.
 */
export function jugerCoupes(racine: NoeudCoupes, posees: readonly number[]): VerdictCoupes {
  const noeuds = rassembler(racine)
  const attendues = new Set(noeuds.flatMap((n) => n.coupes))
  const restantes = new Set(posees)
  const placees = new Set<number>()
  const bordOk = (b: number) => b === racine.debut || b === racine.fin || placees.has(b)
  for (;;) {
    const juste = [...restantes].find((c) => noeuds.some((n) => n.coupes.includes(c) && bordOk(n.debut) && bordOk(n.fin)))
    if (juste === undefined) break
    restantes.delete(juste)
    placees.add(juste)
  }
  if (restantes.size > 0) return 'faux'
  return placees.size === attendues.size && [...attendues].every((c) => placees.has(c)) ? 'termine' : 'continue'
}

/** Verdict d'une réponse. `null` : la donnée manque, le client n'affiche pas de verdict. */
export function juger(d: DonneesRicochets, format: FormatRicochet, unite: string, reponse: ReponseJoueur): boolean | null {
  if (format === 'decouper') {
    const arbre = arbreDuMot(d, unite)
    if (!arbre || !Array.isArray(reponse)) return null
    // Réussi seulement quand toutes les coupes sont posées ; une question encore ouverte n'a pas de verdict.
    const verdict = jugerCoupes(arbre, reponse)
    return verdict === 'termine' ? true : verdict === 'faux' ? false : null
  }
  if (typeof reponse !== 'string') return null
  if (format === 'mot_sens') {
    const classe = d.mots.get(unite)?.classe
    return classe ? reponse === unite || d.mots.get(reponse)?.classe === classe : null
  }
  const brique = d.briques.get(unite)
  if (!brique) return null
  if (format === 'brique_sens') return reponse === unite || d.briques.get(reponse)?.classe === brique.classe
  // sens_brique, paires : le sien, ou celui d'une brique de même glose.
  return reponse === brique.sens || [...d.briques.values()].some((b) => b.sens === reponse && b.classe === brique.classe)
}

export function melanger<T>(valeurs: T[], hasard: () => number = Math.random): T[] {
  const copie = [...valeurs]
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1))
    ;[copie[i], copie[j]] = [copie[j] as T, copie[i] as T]
  }
  return copie
}

export function motDe(jeu: CatalogueJeu, id: string): string {
  const carte = jeu.cartes.get(id)
  return carte ? texteDuMot(carte) : '…'
}

const JOUR_MS = 86_400_000

/** Retour d'une carte confirmé par le serveur : « Demain », « Dans 3 jours », « Maîtrisée · dans 7 jours ». */
export function retour(carte: CarteRicochet, aujourdhui: Date = new Date()): string {
  const jour = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  const auj = Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate())
  const jours = Math.max(1, Math.round((jour(carte.prochaine_revision) - auj) / JOUR_MS))
  const delai = jours === 1 ? 'Demain' : `Dans ${jours} jours`
  return carte.maitrisee ? `Maîtrisée · ${delai.toLowerCase()}` : delai
}

/** Morceaux du mot dans sa composition préférée, aux couleurs de leurs briques (verdict de « découper »). */
export function morceauxDuMot(jeu: CatalogueJeu, motId: string): { debut: number; fin: number; nature: BriqueJeu['nature']; unite: string }[] {
  const compositions = jeu.cartes.get(motId)?.compositions ?? []
  const choisie = compositions.find((c) => c.preferee) ?? compositions[0]
  return [...(choisie?.parties ?? [])]
    .sort((a, b) => a.rang - b.rang)
    .map((p) => ({ debut: p.segment_debut ?? -1, fin: p.segment_fin ?? -1, nature: jeu.cartes.get(p.unite_id)?.nature ?? 'mot', unite: p.unite_id }))
}

/**
 * Morceaux élémentaires d'un mot, une fois toutes les coupes de l'arbre posées : leur place
 * dans le mot entier et leur nature (préfixe, mot, suffixe). La nature vient de la composition
 * de chaque partie ; à défaut, de la place du morceau.
 */
export function feuillesDuMot(jeu: CatalogueJeu, motId: string, noeud: NoeudCoupes): { debut: number; fin: number; nature: BriqueJeu['nature'] }[] {
  const bornes = [noeud.debut, ...[...noeud.coupes].sort((a, b) => a - b), noeud.fin]
  const parties = morceauxDuMot(jeu, motId)
  const alignees = parties.length === bornes.length - 1
  return bornes.slice(1).flatMap((fin, i) => {
    const debut = bornes[i] as number
    const sous = noeud.parties?.find((p) => p.debut === debut)
    const partie = alignees ? parties[i] : undefined
    if (sous && partie) return feuillesDuMot(jeu, partie.unite, sous)
    const nature = partie?.nature ?? (i === 0 ? 'prefixe' : i === bornes.length - 2 ? 'suffixe' : 'mot')
    return [{ debut, fin, nature }]
  })
}

/** Briques de la première recette du mot, dans l'ordre : les morceaux de la composition sont des unités, pas des briques. */
export function briquesDuMot(jeu: CatalogueJeu, motId: string): BriqueJeu[] {
  const recette = jeu.recettes.find((r) => r.motId === motId)
  return (recette?.emplacements ?? []).flatMap((e) => {
    const b = e[0] && jeu.briques.get(e[0])
    return b ? [b] : []
  })
}

/** Cartes trouvées que les ricochets savent poser : briques de la réserve et mots du codex. */
export function cartesTrouvees(d: DonneesRicochets, etat: { reserve: { brique_id: string }[]; decouvertes: { mot_id: string }[] }): string[] {
  return [...etat.reserve.map((e) => e.brique_id).filter((b) => d.briques.has(b)), ...etat.decouvertes.map((x) => x.mot_id).filter((m) => d.mots.has(m))]
}

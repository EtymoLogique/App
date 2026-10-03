// Ricochets (ADR 0044) : de quoi poser et juger une question depuis le catalogue,
// qui est public. Le verdict s'affiche aussitôt ; le serveur fait foi pour le
// niveau, la maîtrise et les quêtes. Miroir de `juger` (crates/api/src/ricochets.rs).

import type { CarteRicochet, QuestionRicochet } from '../contrat'
import { type CatalogueJeu, formeCanonique, texteDuMot } from './jeu'

export type FormatRicochet = QuestionRicochet['format']

/** Réponse d'un joueur : un choix, ou les positions de coupe d'un mot. */
export type ReponseJoueur = string | number[]

interface BriqueRicochet {
  sens: string
  classe: string
}

export interface DonneesRicochets {
  briques: Map<string, BriqueRicochet>
  /** Classe du sens littéral et coupes, par mot. */
  mots: Map<string, { classe: string | null; coupes: number[] }>
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
    for (const m of manifeste.ricochets?.mots ?? []) donnees.mots.set(m.id, { classe: m.classe_litteral ?? null, coupes: m.coupes ?? [] })
  }
  return donnees
}

/** Sens littéral d'un mot, dans sa composition préférée. */
export function sensLitteral(jeu: CatalogueJeu, motId: string): string | null {
  const compositions = jeu.cartes.get(motId)?.compositions ?? []
  const choisie = compositions.find((c) => c.preferee) ?? compositions[0]
  return choisie?.libelles.fr?.sens_litteral ?? null
}

/** Verdict d'une réponse. `null` : la donnée manque, le client n'affiche pas de verdict. */
export function juger(d: DonneesRicochets, format: FormatRicochet, unite: string, reponse: ReponseJoueur): boolean | null {
  if (format === 'decouper') {
    const attendu = d.mots.get(unite)?.coupes
    if (!attendu?.length || !Array.isArray(reponse)) return null
    const coupes = [...new Set(reponse)].sort((a, b) => a - b)
    return coupes.length === attendu.length && coupes.every((c, i) => c === attendu[i])
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

/** Quatre découpages proposés : le bon, et trois leurres obtenus en déplaçant une coupe d'une ou deux lettres. */
export function propositionsDeCoupe(coupes: number[], longueur: number, hasard: () => number = Math.random): number[][] {
  const connus = new Set([coupes.join()])
  const leurres: number[][] = []
  const essais = coupes.flatMap((_, i) => [-1, 1, -2, 2].map((delta) => [i, delta] as const))
  for (const [i, delta] of melanger(essais, hasard)) {
    const coupe = (coupes[i] ?? 0) + delta
    const autre = coupes.map((c, j) => (j === i ? coupe : c))
    const valide = coupe >= 1 && coupe <= longueur - 1 && autre.every((c, j) => j === 0 || c > (autre[j - 1] ?? 0))
    if (valide && !connus.has(autre.join())) {
      connus.add(autre.join())
      leurres.push(autre)
    }
  }
  return melanger([coupes, ...leurres.slice(0, 3)], hasard)
}

export function melanger<T>(valeurs: T[], hasard: () => number = Math.random): T[] {
  const copie = [...valeurs]
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1))
    ;[copie[i], copie[j]] = [copie[j] as T, copie[i] as T]
  }
  return copie
}

/** Mot coupé aux positions données : « géo · graphie ». */
export function motCoupe(mot: string, coupes: number[]): string {
  const lettres = Array.from(mot)
  const bornes = [0, ...coupes, lettres.length]
  return bornes
    .slice(1)
    .map((fin, i) => lettres.slice(bornes[i], fin).join(''))
    .join(' · ')
}

export function motDe(jeu: CatalogueJeu, id: string): string {
  const carte = jeu.cartes.get(id)
  return carte ? texteDuMot(carte) : '…'
}

export function longueurDuMot(jeu: CatalogueJeu, id: string): number {
  const carte = jeu.cartes.get(id)
  const forme = carte && formeCanonique(carte)
  return forme ? Array.from(forme.texte).length : 0
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

// Ricochets (ADR 0044) : de quoi poser et juger une question depuis le catalogue,
// qui est public. Le verdict s'affiche aussitôt ; le serveur fait foi pour le
// niveau, la maîtrise et les quêtes. Miroir de `juger` (crates/api/src/ricochets.rs).

import type { CarteRicochet, QuestionRicochet } from '../contrat'
import { type BriqueJeu, type CatalogueJeu, texteDuMot } from './jeu'

export type FormatRicochet = QuestionRicochet['format']

/** Réponse d'un joueur : un choix, les positions de coupe d'un mot, toutes ses découpes, ou le préfixe puis le suffixe d'un assemblage. */
export type ReponseJoueur = string | number[] | number[][] | string[]

export type PositionBrique = 'prefixe' | 'suffixe'

interface BriqueRicochet {
  sens: string
  classe: string
  /** Colonne dans « assembler » ; `null` : jamais proposée. */
  position: PositionBrique | null
}

export interface DonneesRicochets {
  briques: Map<string, BriqueRicochet>
  /** Classe du sens littéral, découpes justes (une par façon de couper le mot, la préférée d'abord), variantes équivalentes de la préférée et assemblage (préfixe, suffixe), par mot. */
  mots: Map<string, { classe: string | null; decoupes: number[][]; alternatives?: number[][]; assemblage: string[] }>
  /** Glose de chaque sens affiché d'une brique. */
  gloses: Map<string, string>
}

export function donneesRicochets(jeu: CatalogueJeu): DonneesRicochets {
  const donnees: DonneesRicochets = { briques: new Map(), mots: new Map(), gloses: new Map() }
  for (const { manifeste } of jeu.fascicules) {
    for (const b of manifeste.ricochets?.briques ?? []) {
      donnees.briques.set(b.id, { sens: b.sens_id, classe: b.classe_sens, position: b.position ?? null })
      const glose = jeu.briques.get(b.id)?.glose
      if (glose) donnees.gloses.set(b.sens_id, glose)
    }
    for (const m of manifeste.ricochets?.mots ?? []) {
      // Miroir de `MotRicochet::decoupes` (crates/catalogue/src/format.rs).
      const decoupes = (m.coupes ?? []).length ? [m.coupes ?? []] : []
      for (const autre of m.autres_coupes ?? []) if (decoupes.length && autre.length && !decoupes.some((c) => memesCoupes(c, autre))) decoupes.push(autre)
      donnees.mots.set(m.id, { classe: m.classe_litteral ?? null, decoupes, alternatives: m.coupes_alternatives ?? [], assemblage: m.assemblage ?? [] })
    }
  }
  return donnees
}

export function normaliserCoupes(coupes: number[]): number[] {
  return [...new Set(coupes)].sort((a, b) => a - b)
}

export function memesCoupes(a: number[], b: number[]): boolean {
  const [x, y] = [normaliserCoupes(a), normaliserCoupes(b)]
  return x.length === y.length && x.every((c, i) => c === y[i])
}

/** Sens littéral d'un mot, dans sa composition préférée. */
export function sensLitteral(jeu: CatalogueJeu, motId: string): string | null {
  const compositions = jeu.cartes.get(motId)?.compositions ?? []
  const choisie = compositions.find((c) => c.preferee) ?? compositions[0]
  return choisie?.libelles.fr?.sens_litteral ?? null
}

/** Verdict d'une réponse. `null` : la donnée manque, le client n'affiche pas de verdict. */
export function juger(d: DonneesRicochets, format: FormatRicochet, unite: string, reponse: ReponseJoueur): boolean | null {
  if (format === 'assembler') {
    const attendu = d.mots.get(unite)?.assemblage
    if (attendu?.length !== 2 || !Array.isArray(reponse) || reponse.length !== 2) return null
    return reponse.every((b, i) => b === attendu[i])
  }
  if (format === 'decouper') {
    const mot = d.mots.get(unite)
    if (!mot?.decoupes.length || typeof reponse === 'string' || typeof reponse[0] === 'string') return null
    const donnees = Array.isArray(reponse[0]) || reponse.length === 0 ? (reponse as number[][]) : [reponse as number[]]
    // Toutes les découpes justes sont attendues, et seulement elles ; l'ordre et les doublons ne comptent pas.
    // La préférée ou l'une de ses variantes équivalentes compte pour une seule.
    const rang = (c: number[]) => (mot.alternatives ?? []).some((a) => memesCoupes(a, c)) ? 0 : mot.decoupes.findIndex((a) => memesCoupes(a, c))
    const trouvees = new Set<number>()
    for (const c of donnees) {
      const r = rang(c)
      if (r < 0) return false
      trouvees.add(r)
    }
    return trouvees.size === mot.decoupes.length
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
export function morceauxDuMot(jeu: CatalogueJeu, motId: string): { debut: number; fin: number; nature: BriqueJeu['nature'] }[] {
  const compositions = jeu.cartes.get(motId)?.compositions ?? []
  const choisie = compositions.find((c) => c.preferee) ?? compositions[0]
  return [...(choisie?.parties ?? [])]
    .sort((a, b) => a.rang - b.rang)
    .map((p) => ({ debut: p.segment_debut ?? -1, fin: p.segment_fin ?? -1, nature: jeu.cartes.get(p.unite_id)?.nature ?? 'mot' }))
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

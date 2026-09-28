// Plis côté client : chances affichées et énergie qui s'écoule entre deux
// réponses du serveur. `poids` est le miroir de `etymo_domaine::pli::poids` :
// changez les deux ensemble, avec leurs tests. Le tirage, lui, reste au serveur.

import type { CompteurPli, EnergieEtat, Etat, Manifeste, Rarete, SabliersEtat } from '../contrat'
import type { CatalogueJeu, FasciculeParu } from './jeu'

type PliManifeste = NonNullable<Manifeste['pli']>
export type BriquePli = NonNullable<PliManifeste['briques']>[number]
export type Equilibrage = NonNullable<PliManifeste['equilibrage']>

/** Briques tirables d'un fascicule : ses préfixes et ses suffixes, jamais un mot (ADR 0035). */
export function briquesDuPli(f: FasciculeParu): BriquePli[] {
  return (f.manifeste.pli?.briques ?? []).filter((b) => b.nature !== 'mot')
}

export const ORDRE_RARETES: Rarete[] = ['commune', 'peu_commune', 'rare', 'legendaire']
export const LIBELLES_RARETES: Record<Rarete, string> = {
  commune: 'Commune',
  peu_commune: 'Peu commune',
  rare: 'Rare',
  legendaire: 'Légendaire',
}

/** Poids des briques : celui de leur seule rareté (ADR 0035), miroir de `etymo_domaine::pli::poids`. */
export function poids(briques: BriquePli[], equilibrage: Equilibrage): number[] {
  return briques.map((b) => equilibrage.poids_raretes[b.rarete] ?? 0)
}

export interface Chances {
  /** Chance de chaque brique, de 0 à 1, dans l'ordre du manifeste. */
  briques: { brique: BriquePli; chance: number }[]
  parRarete: Record<Rarete, number>
}

/** Chances d'un tirage ordinaire, calculées sur les poids réels. */
export function chances(briques: BriquePli[], equilibrage: Equilibrage): Chances {
  const p = poids(briques, equilibrage)
  const somme = p.reduce((a, b) => a + b, 0) || 1
  const parRarete: Record<Rarete, number> = { commune: 0, peu_commune: 0, rare: 0, legendaire: 0 }
  const resultat = briques.map((brique, i) => {
    const chance = (p[i] ?? 0) / somme
    parRarete[brique.rarete] += chance
    return { brique, chance }
  })
  return { briques: resultat, parRarete }
}

/**
 * Pourcentage sans arrondi trompeur (ADR 0011) : une chance non nulle n'est
 * jamais affichée « 0 % », ni une chance incomplète « 100 % ».
 */
export function pourcentage(chance: number): string {
  if (chance <= 0) return '0 %'
  if (chance >= 1) return '100 %'
  const p = chance * 100
  const texte = p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2)
  const borne = Math.min(Math.max(Number(texte), p < 1 ? 0.01 : 0.1), 99.9)
  return `${String(borne).replace('.', ',')} %`
}

/** Énergie à un instant donné, rattrapée comme le fait le serveur (`Energie::a`). */
export function energieA(energie: EnergieEtat, maintenant: number): { charges: number; prochaine: number | null } {
  let charges = energie.charges
  let prochaine = energie.prochaine_charge ? Date.parse(energie.prochaine_charge) : null
  const recharge = energie.recharge_s * 1000
  while (charges < energie.capacite && prochaine !== null && prochaine <= maintenant) {
    charges += 1
    prochaine = charges < energie.capacite ? prochaine + recharge : null
  }
  return { charges: Math.min(charges, energie.capacite), prochaine: charges >= energie.capacite ? null : prochaine }
}

/** « 04:21:50 » : le temps restant exact, jamais arrondi. */
export function duree(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const deux = (n: number) => String(n).padStart(2, '0')
  return `${deux(Math.floor(s / 3600))}:${deux(Math.floor((s % 3600) / 60))}:${deux(s % 60)}`
}

/** Durée en toutes lettres : « 3 h », « 1 h 30 min », « 25 s ». Arrondie à la minute au-delà d'une minute. */
export function dureeLisible(ms: number): string {
  const s = ms >= 60_000 ? Math.round(ms / 60_000) * 60 : Math.max(0, Math.round(ms / 1000))
  const parties = [
    [Math.floor(s / 3600), 'h'],
    [Math.floor((s % 3600) / 60), 'min'],
    [s % 60, 's'],
  ] as const
  return (
    parties
      .filter(([n]) => n > 0)
      .map(([n, u]) => `${n}\u00a0${u}`)
      .join(' ') || '0\u00a0s'
  )
}

export function compteur(etat: Etat | null, fascicule: string): CompteurPli {
  return (
    etat?.compteurs_plis.find((c) => c.fascicule_id === fascicule) ?? {
      fascicule_id: fascicule,
      plis_sans_nouveaute: 0,
      plis_sans_utilite: 0,
    }
  )
}

/** Un pli s'ouvre s'il a des briques et son équilibrage. */
export function pliOuvrable(f: FasciculeParu): boolean {
  const briques = briquesDuPli(f)
  return Boolean(f.manifeste.pli?.equilibrage) && briques.length > 0 && briques.every((b) => b.nature)
}

/** Briques connues et exemplaires en réserve pour un fascicule (I-19). */
export function reserveDuFascicule(jeu: CatalogueJeu, etat: Etat | null, f: FasciculeParu): { connues: number; exemplaires: number } {
  const ids = new Set(briquesDuPli(f).map((b) => b.id))
  const lignes = (etat?.reserve ?? []).filter((e) => ids.has(e.brique_id) && jeu.briques.has(e.brique_id))
  return { connues: lignes.length, exemplaires: lignes.reduce((n, e) => n + e.exemplaires, 0) }
}

/** Avance d'un sablier : un douzième de la recharge, 1 h en production (`etymo_domaine::sablier::duree`). */
export function dureeSablier(energie: EnergieEtat): number {
  return (energie.recharge_s * 1000) / 12
}

/** Temps qu'il reste avant que l'énergie soit pleine ; au-delà, un sablier ne sert plus. */
export function avantPlein(energie: EnergieEtat, maintenant: number): number {
  const { charges, prochaine } = energieA(energie, maintenant)
  if (prochaine === null) return 0
  return prochaine - maintenant + (energie.capacite - charges - 1) * energie.recharge_s * 1000
}

/** Sabliers qui remplissent l'énergie : au-delà, un sablier ne sert plus. Le dernier peut n'avancer qu'une partie de son heure. */
export function nombrePourRemplir(energie: EnergieEtat, maintenant: number): number {
  return Math.ceil(avantPlein(energie, maintenant) / dureeSablier(energie))
}

/** Sabliers que l'encre achète : 10 gouttes chacun, sans plafond (ADR 0039). */
export function sabliersAchetables(sabliers: SabliersEtat, encre: number): number {
  return Math.max(0, Math.floor(encre / sabliers.prix_gouttes))
}

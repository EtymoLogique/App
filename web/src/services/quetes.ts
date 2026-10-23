// Quêtes de fascicule (ADR 0038, 0042) : chaque jalon s'atteint à un nombre de
// mots du fascicule découverts ; sa récompense attend que le joueur vienne la
// récupérer. Le serveur fait foi : un jalon n'est « à récupérer » que s'il le
// dit atteint.

import type { Collection, CritereCollection, Etat, Jalon, Palier, QueteLongCours } from '../contrat'
import { fasciculesDebloques } from './deblocage'
import type { CatalogueJeu, FasciculeParu } from './jeu'

export type EtatJalon = 'en_cours' | 'a_recuperer' | 'recupere'

export interface QueteJalon {
  jalon: Jalon
  fascicule: FasciculeParu
  /** Mots du fascicule découverts, bornés au seuil du jalon. */
  avancee: number
  etat: EtatJalon
}

/** Mots du fascicule découverts : ceux qui font avancer ses jalons, comme le compte le serveur. */
export function motsDecouverts(fascicule: FasciculeParu, etat: Etat | null): number {
  if (!etat) return 0
  const decouverts = new Set(etat.decouvertes.map((d) => d.mot_id))
  return (fascicule.manifeste.cartes ?? []).filter((c) => c.role === 'resultat' && decouverts.has(c.id)).length
}

/**
 * Jalons des fascicules parus et débloqués, dans l'ordre des fascicules puis des
 * seuils. Un fascicule verrouillé n'en montre aucun (ADR 0068).
 */
export function quetesDeFascicule(jeu: CatalogueJeu, etat: Etat | null): QueteJalon[] {
  const atteints = new Set(etat?.jalons_atteints ?? [])
  const recuperes = new Set(etat?.jalons_recuperes ?? [])
  const debloques = fasciculesDebloques(jeu, etat)
  return jeu.fascicules.filter((f) => debloques.has(f.manifeste.id)).flatMap((fascicule) => {
    const trouves = motsDecouverts(fascicule, etat)
    return (fascicule.manifeste.jalons ?? []).map((jalon) => ({
      jalon,
      fascicule,
      avancee: Math.min(trouves, jalon.decouvertes),
      etat: recuperes.has(jalon.id) ? 'recupere' : atteints.has(jalon.id) ? 'a_recuperer' : 'en_cours',
    }))
  })
}

export interface PalierSuivi {
  palier: Palier
  /** Progression de la quête, bornée au seuil du palier. */
  avancee: number
  etat: EtatJalon
}

export interface QueteLongue {
  quete: QueteLongCours
  titre: string
  consigne: string
  /** Progression calculée par le serveur sur le codex ; zéro tant qu'il n'a rien confirmé. */
  progression: number
  paliers: PalierSuivi[]
  /** Faux pour une sorte dont la mécanique n'est pas encore ouverte : ricochets (ADR 0044), carte de lecteur. */
  ouverte: boolean
}

/** Sortes de quête, dans l'ordre de la page (ADR 0045). */
export const SORTES: { sorte: QueteLongCours['sorte']; titre: string }[] = [
  { sorte: 'langue', titre: 'Langues' },
  { sorte: 'famille', titre: 'Familles' },
  { sorte: 'transformation', titre: 'Transformations' },
  { sorte: 'ricochets', titre: 'Ricochets' },
  { sorte: 'lecteur', titre: 'Carte de lecteur' },
  { sorte: 'premiere_legendaire', titre: 'Première légendaire' },
]

/**
 * Quêtes au long cours (ADR 0045). Le serveur mesure la progression sur le
 * codex ; un palier est atteint quand elle franchit son seuil, et sa
 * récompense attend que le joueur vienne la récupérer. Elles n'expirent jamais.
 */
export function quetesAuLongCours(jeu: CatalogueJeu, etat: Etat | null): QueteLongue[] {
  const progressions = new Map((etat?.progression_quetes ?? []).map((p) => [p.quete_id, p.progression]))
  const recuperes = new Set(etat?.paliers_recuperes ?? [])
  return jeu.quetes.map((quete) => {
    const progression = progressions.get(quete.id) ?? 0
    return {
      quete,
      titre: quete.libelles.fr?.titre ?? quete.id,
      consigne: quete.libelles.fr?.consigne ?? '',
      progression,
      ouverte: quete.sorte !== 'ricochets' && quete.sorte !== 'lecteur',
      paliers: [...quete.paliers]
        .sort((a, b) => a.seuil - b.seuil)
        .map((palier) => ({
          palier,
          avancee: Math.min(progression, palier.seuil),
          etat: recuperes.has(palier.id) ? 'recupere' : progression >= palier.seuil ? 'a_recuperer' : 'en_cours',
        })),
    }
  })
}

/** Intitulés des quêtes de collection (App#90), dans l'ordre d'affichage. */
export const CRITERES: Record<CritereCollection, string> = {
  prefixes: 'Tous les préfixes',
  suffixes: 'Tous les suffixes',
  mots_communs: 'Tous les mots communs',
  mots_peu_communs: 'Tous les mots peu communs',
  mots_rares: 'Tous les mots rares',
}
const ORDRE_CRITERES = Object.keys(CRITERES) as CritereCollection[]

export interface QueteCollection {
  collection: Collection
  fascicule: FasciculeParu
  /** Comme un palier : son seuil est le total, sa récompense celle de la collection. */
  suivi: PalierSuivi
}

/**
 * Quêtes de collection (App#90) : tous les préfixes, tous les suffixes, tous les
 * mots d'une rareté d'un fascicule. Le serveur compte, et ne renvoie que les
 * fascicules débloqués : un fascicule verrouillé n'expose aucun total (ADR 0069).
 * La récompense se récupère comme un palier (ADR 0042).
 */
export function quetesDeCollection(jeu: CatalogueJeu, etat: Etat | null): QueteCollection[] {
  const recuperes = new Set(etat?.paliers_recuperes ?? [])
  return (etat?.progression_collections ?? []).flatMap((p) => {
    const fascicule = jeu.fascicules.find((f) => f.manifeste.id === p.fascicule_id)
    const collection = fascicule?.manifeste.collections?.find((c) => c.id === p.palier_id)
    if (!fascicule || !collection || p.total === 0) return []
    const palier: Palier = { id: collection.id, seuil: p.total, encre: collection.encre, sabliers: collection.sabliers }
    const etatPalier: EtatJalon = recuperes.has(collection.id) ? 'recupere' : p.progression >= p.total ? 'a_recuperer' : 'en_cours'
    return [{ collection, fascicule, suivi: { palier, avancee: Math.min(p.progression, p.total), etat: etatPalier } }]
  }).sort((a, b) => a.fascicule.numero - b.fascicule.numero || ORDRE_CRITERES.indexOf(a.collection.critere) - ORDRE_CRITERES.indexOf(b.collection.critere))
}

/** Récompenses qui attendent le joueur, jalons et paliers : le compteur de la navigation. */
export function recompensesARecuperer(jeu: CatalogueJeu | null, etat: Etat | null): number {
  if (!jeu || !etat) return 0
  const paliers = quetesAuLongCours(jeu, etat).flatMap((q) => q.paliers).filter((p) => p.etat === 'a_recuperer').length
  const cartes = etat.carte_de_lecteur?.a_recuperer ?? 0
  const cadeau = etat.cadeau_de_bienvenue && !etat.cadeau_de_bienvenue.recupere ? 1 : 0
  const initiales = (etat.quetes_initiales ?? []).filter((q) => q.faite && !q.recuperee).length
  const collections = quetesDeCollection(jeu, etat).filter((q) => q.suivi.etat === 'a_recuperer').length
  return quetesDeFascicule(jeu, etat).filter((q) => q.etat === 'a_recuperer').length + paliers + cartes + cadeau + initiales + collections
}

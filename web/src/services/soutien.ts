// Soutien par dons sur Ko-fi (ADR 0078) : un lien et un rappel de temps en temps, jamais un avantage de jeu.

import type { Etat } from '../contrat'

export const URL_KOFI = 'https://ko-fi.com/lunik_tiwabbit'

/** Mémoire du rappel sur cet appareil : une préférence locale, pas une donnée du serveur. */
export interface SouvenirSoutien {
  /** Secondes passées à jouer sur cet appareil (onglet visible, joueur présent). */
  temps_de_jeu_s: number
  /** Horodatage (ms) de la dernière fermeture de la modale ; `null` : jamais montrée. */
  fermee_le: number | null
  /** Horodatage (ms) où le joueur a masqué la carte des Réglages et de la Boutique ; `null` : jamais. */
  carte_masquee_le: number | null
}

export const SOUVENIR_SOUTIEN_VIERGE: SouvenirSoutien = { temps_de_jeu_s: 0, fermee_le: null, carte_masquee_le: null }

/** Durée du masquage de la carte, en jours réels. */
const JOURS_MASQUEE = 30
/** Temps de jeu avant la première modale : on ne sollicite pas qui découvre le jeu. */
const PREMIERE_APRES_S = 15 * 60
/** Jours réels entre deux modales. */
const JOURS_ENTRE_DEUX = 7
/** Inactivité à l'écran avant d'afficher la modale : jamais au milieu d'un geste. */
export const INACTIVITE_MS = 60_000
const JOUR_MS = 86_400_000

/** Vrai si l'adresse du compte a un abonnement Ko-fi actif : le serveur fait foi. */
export function estAbonne(etat: Etat | null): boolean {
  return etat?.compte?.soutien === true
}

/** La modale : ni aux abonnés, ni avant 15 minutes de jeu, puis une fois tous les 7 jours. */
export function doitSolliciter(etat: Etat, souvenir: SouvenirSoutien, maintenant = Date.now()): boolean {
  if (estAbonne(etat)) return false
  if (souvenir.fermee_le === null) return souvenir.temps_de_jeu_s >= PREMIERE_APRES_S
  return maintenant - souvenir.fermee_le >= JOURS_ENTRE_DEUX * JOUR_MS
}

export function fermerSoutien(souvenir: SouvenirSoutien, maintenant = Date.now()): SouvenirSoutien {
  return { ...souvenir, fermee_le: maintenant }
}

export function ajouterTempsDeJeu(souvenir: SouvenirSoutien, secondes: number): SouvenirSoutien {
  return { ...souvenir, temps_de_jeu_s: souvenir.temps_de_jeu_s + secondes }
}

/** La carte masquée revient d'elle-même après 30 jours. */
export function carteMasquee(souvenir: SouvenirSoutien, maintenant = Date.now()): boolean {
  return souvenir.carte_masquee_le !== null && maintenant - souvenir.carte_masquee_le < JOURS_MASQUEE * JOUR_MS
}

export function masquerCarte(souvenir: SouvenirSoutien, maintenant = Date.now()): SouvenirSoutien {
  return { ...souvenir, carte_masquee_le: maintenant }
}

/** Relit un souvenir d'IndexedDB : un champ absent ou invalide repart de sa valeur vierge. */
export function lireSouvenirSoutien(valeur: unknown): SouvenirSoutien {
  if (typeof valeur !== 'object' || valeur === null) return SOUVENIR_SOUTIEN_VIERGE
  const v = valeur as Record<string, unknown>
  const nombre = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null)
  return { temps_de_jeu_s: nombre(v.temps_de_jeu_s) ?? 0, fermee_le: nombre(v.fermee_le), carte_masquee_le: nombre(v.carte_masquee_le) }
}

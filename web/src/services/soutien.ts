// Soutien par dons sur Ko-fi (ADR 0078) : un lien et un rappel de temps en temps, jamais un avantage de jeu.

import type { Etat } from '../contrat'

export const URL_KOFI = 'https://ko-fi.com/lunik_tiwabbit'

/** Mémoire du rappel sur cet appareil : une préférence locale, pas une donnée du serveur. */
export interface SouvenirSoutien {
  /** Jour de jeu (`Etat.jours_de_jeu`) où la modale a été fermée ; `null` : jamais. */
  fermee_le_jour_de_jeu: number | null
  /** Horodatage (ms) où le joueur a masqué la carte des Réglages et de la Boutique ; absent : jamais. */
  carte_masquee_le?: number | null
}

export const SOUVENIR_SOUTIEN_VIERGE: SouvenirSoutien = { fermee_le_jour_de_jeu: null }

/** Découvertes et jours de jeu avant la première modale : on ne sollicite pas qui découvre le jeu. */
const DECOUVERTES_MIN = 5
const JOURS_MIN = 3
/** Durée du masquage de la carte, en jours réels. */
const JOURS_MASQUEE = 30
/** Jours de jeu entre deux modales. */
const JOURS_ENTRE_DEUX = 30

/** Vrai si l'adresse du compte a un abonnement Ko-fi actif : le serveur fait foi. */
export function estAbonne(etat: Etat | null): boolean {
  return etat?.compte?.soutien === true
}

/** La modale : ni aux abonnés, ni aux débutants, puis une fois tous les 30 jours de jeu. */
export function doitSolliciter(etat: Etat, souvenir: SouvenirSoutien): boolean {
  if (estAbonne(etat)) return false
  const jour = etat.jours_de_jeu ?? 1
  if (souvenir.fermee_le_jour_de_jeu === null) return etat.decouvertes.length >= DECOUVERTES_MIN && jour >= JOURS_MIN
  return jour - souvenir.fermee_le_jour_de_jeu >= JOURS_ENTRE_DEUX
}

export function fermerSoutien(etat: Etat, souvenir: SouvenirSoutien): SouvenirSoutien {
  return { ...souvenir, fermee_le_jour_de_jeu: etat.jours_de_jeu ?? 1 }
}

/** La carte masquée revient d'elle-même après 30 jours. */
export function carteMasquee(souvenir: SouvenirSoutien, maintenant = Date.now()): boolean {
  return souvenir.carte_masquee_le != null && maintenant - souvenir.carte_masquee_le < JOURS_MASQUEE * 86_400_000
}

export function masquerCarte(souvenir: SouvenirSoutien, maintenant = Date.now()): SouvenirSoutien {
  return { ...souvenir, carte_masquee_le: maintenant }
}

export function estSouvenirSoutien(valeur: unknown): valeur is SouvenirSoutien {
  if (typeof valeur !== 'object' || valeur === null) return false
  const { fermee_le_jour_de_jeu, carte_masquee_le } = valeur as Record<string, unknown>
  return (fermee_le_jour_de_jeu === null || typeof fermee_le_jour_de_jeu === 'number') && (carte_masquee_le == null || typeof carte_masquee_le === 'number')
}

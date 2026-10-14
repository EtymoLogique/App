// Compte facultatif (ADR 0070) : connexion par un lien et un code envoyés par
// e-mail, pseudo, déconnexion, suppression, et la relance « Sauvegardez votre
// progression ». L'adresse ne sert qu'à la demande : rien ne la garde ici.

import type { AvertissementRemplacement, CompteEtat, DemandeConfirmation, Etat, ReponseConfirmation, ReponseDemandeCompte } from '../contrat'
import { type ClientApi, ErreurApi } from './api'
import { remplacerProfil } from './profil'

export interface LienConnexion {
  defi: string
  jeton: string
}

let lienLu: LienConnexion | null | undefined

/**
 * Défi et jeton du lien de l'e-mail (`#/connexion?defi=…&jeton=…`), retirés de
 * l'adresse dès qu'ils y sont lus, au chargement comme quand la PWA ouverte
 * reçoit le lien : ils ne restent ni dans l'historique ni dans un favori. Le
 * fragment n'est jamais envoyé au serveur.
 */
export function lienDeConnexion(): LienConnexion | null {
  const [chemin = '', requete = ''] = window.location.hash.replace(/^#\/?/, '').split('?')
  const params = new URLSearchParams(requete)
  if (chemin === 'connexion' && (params.has('defi') || params.has('jeton'))) {
    const defi = params.get('defi')
    const jeton = params.get('jeton')
    lienLu = defi && jeton ? { defi, jeton } : null
    history.replaceState(history.state, '', '#/connexion')
  }
  lienLu ??= null
  return lienLu
}

/** Le lien a servi : revenir à l'écran ne le confirme pas une seconde fois. */
export function oublierLien(): void {
  lienLu = null
}

/** Message du joueur pour une erreur sans traitement propre : jamais de code technique. */
function message(e: unknown): string {
  if (e instanceof ErreurApi && e.code === 'reseau') return 'Le serveur est injoignable pour le moment.'
  if (e instanceof ErreurApi && e.code === 'trop_de_requetes') return 'Trop de demandes : réessayez dans quelques minutes.'
  if (e instanceof ErreurApi && e.statut === 503) return 'Impossible d’envoyer l’e-mail pour l’instant. Réessayez plus tard.'
  return 'Une erreur est survenue. Réessayez plus tard.'
}

export async function demander(api: ClientApi, courriel: string): Promise<ReponseDemandeCompte | { erreur: string }> {
  try {
    return await api.demandeCompte({ courriel })
  } catch (e) {
    if (e instanceof ErreurApi && e.statut === 400) return { erreur: 'Cette adresse électronique ne semble pas valide.' }
    if (e instanceof ErreurApi && e.statut === 409) return { erreur: 'Cet appareil a déjà un compte.' }
    return { erreur: message(e) }
  }
}

export type Confirmation = ReponseConfirmation | { avertissement: AvertissementRemplacement } | { erreur: string }

export function essaisRestants(n: number): string {
  return `Ce code ne correspond pas. Il vous reste ${n} essai${n > 1 ? 's' : ''}.`
}

/**
 * Défi déjà consommé : si une première confirmation a réussi mais que sa
 * réponse s'est perdue, le rejeu reçoit `410`. L'état du serveur, relu sur une
 * session rouverte, dit alors si l'appareil a un compte : c'est un succès.
 */
async function dejaRattache(api: ClientApi): Promise<ReponseConfirmation | null> {
  try {
    api.oublierSession()
    const { compte } = await api.etat()
    return compte ? { issue: 'connecte', pseudo: compte.pseudo, pseudo_confirme: compte.pseudo_confirme } : null
  } catch {
    return null
  }
}

export async function confirmer(api: ClientApi, demande: DemandeConfirmation): Promise<Confirmation> {
  try {
    return await api.confirmerCompte(demande)
  } catch (e) {
    if (e instanceof ErreurApi && e.details.avertissement) return { avertissement: e.details.avertissement }
    if (e instanceof ErreurApi && e.details.essais_restants != null) return { erreur: essaisRestants(e.details.essais_restants) }
    if (e instanceof ErreurApi && e.statut === 410) return (await dejaRattache(api)) ?? { erreur: 'Demandez un nouveau code.' }
    if (e instanceof ErreurApi && e.statut === 409) return { erreur: 'Cet appareil a déjà un compte.' }
    return { erreur: message(e) }
  }
}

export const PSEUDO = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const REGLE_PSEUDO = '3 à 24 caractères : lettres minuscules sans accent, chiffres et traits d’union.'

export async function changerPseudo(api: ClientApi, pseudo: string): Promise<CompteEtat | { erreur: string; proposition?: string }> {
  if (pseudo.length < 3 || pseudo.length > 24 || !PSEUDO.test(pseudo)) return { erreur: REGLE_PSEUDO }
  try {
    return await api.changerPseudo({ pseudo })
  } catch (e) {
    const proposition = e instanceof ErreurApi ? e.details.proposition : undefined
    if (proposition) return { erreur: `Ce pseudo est déjà pris. Essayez « ${proposition} ».`, proposition }
    if (e instanceof ErreurApi && e.statut === 400) return { erreur: REGLE_PSEUDO }
    return { erreur: message(e) }
  }
}

/** Détache l'appareil, puis repart d'un profil invité neuf. Renvoie un message d'erreur, ou `null`. */
export async function deconnecter(api: ClientApi): Promise<string | null> {
  try {
    await api.deconnecter()
  } catch (e) {
    return message(e)
  }
  await remplacerProfil()
  return null
}

/** Efface le compte sur tous les appareils, puis repart d'un profil invité neuf. */
export async function supprimer(api: ClientApi): Promise<string | null> {
  try {
    await api.supprimerCompte({ confirmation: 'SUPPRIMER' })
  } catch (e) {
    return message(e)
  }
  await remplacerProfil()
  return null
}

/** Mémoire de la relance sur cet appareil : une préférence locale, pas une donnée du serveur. */
export interface SouvenirRelance {
  /** Jour de jeu (`Etat.jours_de_jeu`) où la carte a été refermée ; `null` : jamais. */
  fermee_le_jour_de_jeu: number | null
  /** Jalons atteints déjà connus à la dernière fermeture. */
  jalons_vus: string[]
}

export const SOUVENIR_VIERGE: SouvenirRelance = { fermee_le_jour_de_jeu: null, jalons_vus: [] }

/**
 * La carte « Sauvegardez votre progression » (I-32) : pour un invité, à la
 * 3ᵉ découverte, à chaque jalon atteint depuis la dernière fermeture, sinon
 * tous les 7 jours de jeu depuis la dernière fermeture.
 */
export function doitRelancer(etat: Etat, souvenir: SouvenirRelance): boolean {
  if (etat.compte) return false
  const vus = new Set(souvenir.jalons_vus)
  if ((etat.jalons_atteints ?? []).some((j) => !vus.has(j))) return true
  if (souvenir.fermee_le_jour_de_jeu === null) return etat.decouvertes.length >= 3
  return (etat.jours_de_jeu ?? 1) - souvenir.fermee_le_jour_de_jeu >= 7
}

/** Souvenir après une fermeture : les jalons atteints sont vus, les 7 jours repartent. */
export function fermerRelance(etat: Etat): SouvenirRelance {
  return { fermee_le_jour_de_jeu: etat.jours_de_jeu ?? 1, jalons_vus: [...(etat.jalons_atteints ?? [])] }
}

/** Vérifie un souvenir relu d'IndexedDB. */
export function estSouvenir(valeur: unknown): valeur is SouvenirRelance {
  if (typeof valeur !== 'object' || valeur === null) return false
  const { fermee_le_jour_de_jeu, jalons_vus } = valeur as Record<string, unknown>
  return (fermee_le_jour_de_jeu === null || typeof fermee_le_jour_de_jeu === 'number') && Array.isArray(jalons_vus) && jalons_vus.every((j) => typeof j === 'string')
}

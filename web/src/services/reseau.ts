// État du réseau (ADR 0085) : `navigator.onLine` se dit vrai dès qu'une antenne
// répond, même si rien ne passe. L'état se déduit donc aussi des requêtes : un
// essai qui échoue rend le réseau instable, une commande qui épuise ses essais
// le met hors ligne, et une sonde légère guette son retour.

import { useSyncExternalStore } from 'react'

export type NiveauReseau = 'en_ligne' | 'instable' | 'hors_ligne'

export interface EtatReseau {
  niveau: NiveauReseau
  /** Vrai pendant 2 s après un retour en ligne : « De retour en ligne ». */
  retour: boolean
}

/** Le navigateur doit se dire hors ligne depuis ce délai : une micro-coupure ne fait pas clignoter la pastille. */
export const DELAI_HORS_LIGNE_MS = 2_000
/** Une réponse plus lente que ce seuil rend le réseau instable. */
export const REPONSE_LENTE_MS = 3_000
/** Durée pendant laquelle le réseau reste « instable » après le dernier signe de faiblesse. */
const DUREE_INSTABLE_MS = 30_000
/** Durée du message « De retour en ligne ». */
const DUREE_RETOUR_MS = 2_000
/** Intervalles de la sonde hors ligne : 2 s, puis de plus en plus long, jusqu'à 30 s. */
const SONDES_MS = [2_000, 4_000, 8_000, 15_000, 30_000]

export class Reseau {
  private etat: EtatReseau
  private readonly abonnes = new Set<() => void>()
  private sonde: (() => Promise<unknown>) | undefined
  private minuteurHorsLigne: ReturnType<typeof setTimeout> | undefined
  private minuteurInstable: ReturnType<typeof setTimeout> | undefined
  private minuteurRetour: ReturnType<typeof setTimeout> | undefined
  private minuteurSonde: ReturnType<typeof setTimeout> | undefined
  private essaiSonde = 0
  private ecoute = false

  constructor(enLigne = typeof navigator === 'undefined' || navigator.onLine !== false) {
    this.etat = { niveau: enLigne ? 'en_ligne' : 'hors_ligne', retour: false }
  }

  lire = (): EtatReseau => this.etat

  /** Remet l'état à zéro, sans minuteur en cours (tests). */
  reinitialiser(enLigne = true): void {
    for (const m of [this.minuteurHorsLigne, this.minuteurInstable, this.minuteurRetour, this.minuteurSonde]) clearTimeout(m)
    this.minuteurSonde = undefined
    this.essaiSonde = 0
    this.changer({ niveau: enLigne ? 'en_ligne' : 'hors_ligne', retour: false })
  }

  abonner = (rappel: () => void): (() => void) => {
    this.ecouterNavigateur()
    this.abonnes.add(rappel)
    if (this.etat.niveau === 'hors_ligne') this.planifierSonde()
    return () => this.abonnes.delete(rappel)
  }

  /** Requête légère qui dit si le serveur répond (`GET /sante`). */
  configurerSonde(sonde: () => Promise<unknown>): void {
    this.sonde = sonde
    if (this.etat.niveau === 'hors_ligne') this.planifierSonde()
  }

  /** Une réponse est arrivée : le réseau passe, lentement ou non. */
  noterReussite(dureeMs: number): void {
    if (this.etat.niveau === 'hors_ligne') {
      this.revenir(dureeMs > REPONSE_LENTE_MS ? 'instable' : 'en_ligne')
      return
    }
    if (dureeMs > REPONSE_LENTE_MS) this.devenirInstable()
  }

  /** Un essai a échoué (coupure, délai dépassé, passerelle) : un autre va suivre. */
  noterEchec(): void {
    if (this.etat.niveau !== 'hors_ligne') this.devenirInstable()
  }

  /** Une réponse tarde au-delà de `REPONSE_LENTE_MS`, sans être encore venue. */
  noterLenteur(): void {
    if (this.etat.niveau !== 'hors_ligne') this.devenirInstable()
  }

  /** Une commande a épuisé ses essais : le réseau est perdu, la sonde guette son retour. */
  noterPerte(): void {
    this.passerHorsLigne()
  }

  private changer(etat: EtatReseau): void {
    if (etat.niveau === this.etat.niveau && etat.retour === this.etat.retour) return
    this.etat = etat
    this.abonnes.forEach((rappel) => rappel())
  }

  private devenirInstable(): void {
    clearTimeout(this.minuteurInstable)
    this.minuteurInstable = setTimeout(() => {
      if (this.etat.niveau === 'instable') this.changer({ niveau: 'en_ligne', retour: false })
    }, DUREE_INSTABLE_MS)
    this.changer({ niveau: 'instable', retour: false })
  }

  private passerHorsLigne(): void {
    clearTimeout(this.minuteurInstable)
    clearTimeout(this.minuteurRetour)
    if (this.etat.niveau !== 'hors_ligne') this.essaiSonde = 0
    this.changer({ niveau: 'hors_ligne', retour: false })
    this.planifierSonde()
  }

  private revenir(niveau: Exclude<NiveauReseau, 'hors_ligne'>): void {
    clearTimeout(this.minuteurSonde)
    this.minuteurSonde = undefined
    this.essaiSonde = 0
    clearTimeout(this.minuteurRetour)
    this.minuteurRetour = setTimeout(() => this.changer({ ...this.etat, retour: false }), DUREE_RETOUR_MS)
    this.changer({ niveau, retour: true })
    if (niveau === 'instable') this.devenirInstable()
  }

  private planifierSonde(): void {
    if (!this.sonde || this.minuteurSonde !== undefined || this.abonnes.size === 0) return
    const delai = SONDES_MS[Math.min(this.essaiSonde, SONDES_MS.length - 1)] ?? 30_000
    this.minuteurSonde = setTimeout(() => void this.sonder(), delai)
  }

  /** Sonde tout de suite, par exemple quand le navigateur annonce le retour du réseau. */
  private async sonder(): Promise<void> {
    clearTimeout(this.minuteurSonde)
    this.minuteurSonde = undefined
    if (this.etat.niveau !== 'hors_ligne' || !this.sonde) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.essaiSonde++
      this.planifierSonde()
      return
    }
    try {
      await this.sonde()
      // La sonde passe par le client de l'API : sa réussite a déjà été notée.
      if (this.etat.niveau === 'hors_ligne') this.revenir('en_ligne')
    } catch {
      this.essaiSonde++
      this.planifierSonde()
    }
  }

  private ecouterNavigateur(): void {
    if (this.ecoute || typeof window === 'undefined') return
    this.ecoute = true
    window.addEventListener('offline', () => {
      clearTimeout(this.minuteurHorsLigne)
      this.minuteurHorsLigne = setTimeout(() => {
        if (navigator.onLine === false) this.passerHorsLigne()
      }, DELAI_HORS_LIGNE_MS)
    })
    window.addEventListener('online', () => {
      clearTimeout(this.minuteurHorsLigne)
      // Le navigateur voit une antenne : on vérifie que le serveur répond.
      if (this.etat.niveau === 'hors_ligne') {
        if (this.sonde) void this.sonder()
        else this.revenir('en_ligne')
      }
    })
  }
}

/** État réseau de l'application, partagé par le client de l'API et l'interface. */
export const reseau = new Reseau()

export function useReseau(source: Reseau = reseau): EtatReseau {
  return useSyncExternalStore(source.abonner, source.lire)
}

/** Vrai tant que le réseau n'est pas perdu (en ligne ou instable). */
export function useEnLigne(source: Reseau = reseau): boolean {
  return useReseau(source).niveau !== 'hors_ligne'
}

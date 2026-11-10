// Client de l'API de jeu. Le serveur fait foi (ADR 0007) : le client
// n'invente jamais un résultat à partir d'une erreur.

import type { DemandeAchatSablier, DemandeFusion, DemandeIndice, DemandeJalon, DemandePalier, DemandePli, DemandeRicochet, DemandeSablier, Erreur, Etat, ReponseAchatSablier, ReponseFusion, ReponseIndice, ReponseJalon, ReponsePalier, ReponsePli, ReponseRicochet, ReponseSablier, Sante, SeanceRicochets, Session } from '../contrat'
import { profilLocal } from './profil'
import { REPONSE_LENTE_MS, type Reseau, reseau as reseauGlobal } from './reseau'

export class ErreurApi extends Error {
  readonly statut: number
  readonly code: Erreur['code'] | 'reseau'

  constructor(statut: number, code: ErreurApi['code'], message: string) {
    super(message)
    this.statut = statut
    this.code = code
  }
}

/** Marge avant l'expiration du jeton à partir de laquelle on le renouvelle. */
const MARGE_MS = 60_000

/** Un essai qui dépasse ce délai est abandonné, puis renvoyé (ADR 0085). */
export const DELAI_ESSAI_MS = 8_000
/** Attente avant chaque nouvel essai, avec une part de hasard : 0,5 s, 1 s, 2 s, 4 s. */
export const DELAIS_NOUVEL_ESSAI_MS = [500, 1_000, 2_000, 4_000]
/** Au-delà de cette durée depuis le premier essai, on n'en tente plus. */
const FENETRE_MS = 15_000
/** Un `429` n'est renvoyé que si le serveur demande d'attendre au plus ce délai. */
const ATTENTE_429_MAX_MS = 5_000

export interface OptionsClient {
  /** État du réseau à tenir informé des essais. */
  reseau?: Reseau
  /** Attentes entre les essais (tests : `[]` pour n'en faire qu'un). */
  delais?: number[]
  delaiEssaiMs?: number
}

const attendre = (ms: number) => new Promise<void>((fin) => setTimeout(fin, ms))

/** Signal qui coupe un essai trop long, corps de la réponse compris. */
function signalDelai(ms: number): { signal: AbortSignal; liberer: () => void } {
  const controleur = new AbortController()
  const minuteur = setTimeout(() => controleur.abort(), ms)
  return { signal: controleur.signal, liberer: () => clearTimeout(minuteur) }
}

/** Délai demandé par un `Retry-After` en secondes, s'il est lisible. */
function retryAfter(reponse: Response): number | null {
  const entete = reponse.headers.get('Retry-After')
  const valeur = entete === null || entete.trim() === '' ? NaN : Number(entete)
  return Number.isFinite(valeur) && valeur >= 0 ? valeur * 1000 : null
}

export class ClientApi {
  private session: Session | undefined
  private ouverture: Promise<Session> | undefined
  private renouvellement: ReturnType<typeof setTimeout> | undefined
  private readonly base: string
  private readonly lireProfil: typeof profilLocal
  private readonly reseau: Reseau
  private readonly delais: number[]
  private readonly delaiEssaiMs: number

  constructor(base: string, lireProfil = profilLocal, options: OptionsClient = {}) {
    this.base = base
    this.lireProfil = lireProfil
    this.reseau = options.reseau ?? reseauGlobal
    this.delais = options.delais ?? DELAIS_NOUVEL_ESSAI_MS
    this.delaiEssaiMs = options.delaiEssaiMs ?? DELAI_ESSAI_MS
  }

  /**
   * Un essai : délai borné, corps lu sous le même délai. Renvoie l'erreur à
   * retenter (`nouvelEssai`) ou la réponse définitive du serveur.
   */
  private async essayer<T>(chemin: string, init: RequestInit): Promise<{ ok: T } | { erreur: ErreurApi; nouvelEssai: number | null }> {
    const { signal, liberer } = signalDelai(this.delaiEssaiMs)
    const debut = Date.now()
    // Une réponse qui tarde rend le réseau instable sans attendre qu'elle arrive.
    const lenteur = setTimeout(() => this.reseau.noterLenteur(), REPONSE_LENTE_MS)
    try {
      let reponse: Response
      try {
        reponse = await fetch(`${this.base}${chemin}`, { ...init, credentials: 'omit', cache: 'no-store', signal })
      } catch {
        this.reseau.noterEchec()
        return { erreur: new ErreurApi(0, 'reseau', 'API injoignable'), nouvelEssai: 0 }
      }
      let lu = true
      const corps: unknown = await reponse.json().catch(() => {
        lu = false
        return undefined
      })
      // Corps coupé en route : le serveur a peut-être répondu, la même commande le dira.
      if (!lu && signal.aborted) {
        this.reseau.noterEchec()
        return { erreur: new ErreurApi(0, 'reseau', 'Réponse interrompue'), nouvelEssai: 0 }
      }
      const erreur = reponse.ok ? undefined : (corps as Partial<Erreur> | undefined)
      // Passerelle en défaut (502, 504, ou 503 qui ne vient pas de l'API) : le réseau, pas le serveur.
      if (reponse.status === 502 || reponse.status === 504 || (reponse.status === 503 && !erreur?.code)) {
        this.reseau.noterEchec()
        return { erreur: new ErreurApi(reponse.status, 'reseau', reponse.statusText || 'Passerelle indisponible'), nouvelEssai: 0 }
      }
      this.reseau.noterReussite(Date.now() - debut)
      if (!reponse.ok) {
        const e = new ErreurApi(reponse.status, erreur?.code ?? 'interne', erreur?.message ?? reponse.statusText)
        const attente = reponse.status === 429 ? retryAfter(reponse) : null
        return { erreur: e, nouvelEssai: attente !== null && attente <= ATTENTE_429_MAX_MS ? attente : null }
      }
      return { ok: corps as T }
    } finally {
      liberer()
      clearTimeout(lenteur)
    }
  }

  /**
   * Envoie la requête, et la renvoie à l'identique, même corps donc même clé
   * de commande, tant que le réseau seul est en cause (ADR 0085). Le serveur
   * rejoue une commande déjà traitée : aucun double effet.
   */
  private async appeler<T>(chemin: string, init: RequestInit = {}, retenter = true): Promise<T> {
    const debut = Date.now()
    for (let essai = 0; ; essai++) {
      const resultat = await this.essayer<T>(chemin, init)
      if ('ok' in resultat) return resultat.ok
      const { erreur, nouvelEssai } = resultat
      const pause = retenter ? this.delais[essai] : undefined
      if (nouvelEssai === null) throw erreur
      if (pause === undefined || Date.now() - debut > FENETRE_MS) {
        if (erreur.code === 'reseau' && retenter) this.reseau.noterPerte()
        throw erreur
      }
      // Part de hasard : deux onglets ou deux joueurs ne repartent pas ensemble.
      await attendre(Math.max(nouvelEssai, pause * (0.75 + Math.random() * 0.5)))
    }
  }

  sante(): Promise<Sante> {
    return this.appeler('/sante')
  }

  /** Sonde du retour du réseau : un seul essai, sans rien signaler comme perdu. */
  sonder(): Promise<Sante> {
    return this.appeler('/sante', {}, false)
  }

  /** Ouvre la session si besoin, ou la renouvelle avant son expiration. Une seule ouverture à la fois. */
  async ouvrirSession(forcer = false): Promise<Session> {
    if (!forcer && this.session && Date.parse(this.session.expire_le) - Date.now() > MARGE_MS) return this.session
    this.ouverture ??= (async () => {
      try {
        const profil = await this.lireProfil()
        const session = await this.appeler<Session>('/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profil),
        })
        this.session = session
        this.planifierRenouvellement(session)
        return session
      } finally {
        this.ouverture = undefined
      }
    })()
    return this.ouverture
  }

  /**
   * Renouvelle le jeton en arrière-plan, avant qu'il n'expire : une commande
   * sur un réseau lent n'attend pas deux allers-retours. Page cachée, on attend
   * son retour (une commande renouvellera au besoin).
   */
  private planifierRenouvellement(session: Session): void {
    clearTimeout(this.renouvellement)
    if (typeof document === 'undefined') return
    const dans = Date.parse(session.expire_le) - Date.now() - MARGE_MS - 5_000
    if (!(dans > 0)) return
    this.renouvellement = setTimeout(() => {
      if (document.visibilityState === 'hidden') return
      // L'ancien jeton reste valable jusqu'à la réponse : un échec ne coûte rien.
      this.ouvrirSession(true).catch(() => undefined)
    }, dans)
  }

  /** Appel authentifié ; une session expirée est rouverte une fois. */
  private async authentifie<T>(chemin: string, init: RequestInit = {}): Promise<T> {
    const avec = (jeton: string): RequestInit => ({
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${jeton}` },
    })
    const { jeton } = await this.ouvrirSession()
    try {
      return await this.appeler<T>(chemin, avec(jeton))
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) {
        this.session = undefined
        const nouvelle = await this.ouvrirSession()
        return this.appeler<T>(chemin, avec(nouvelle.jeton))
      }
      throw e
    }
  }

  /** Hors production : remet le joueur à zéro (codex vide, 10 000 gouttes). Route absente (`404`) en production. */
  reinitialiser(): Promise<Etat> {
    return this.authentifie('/dev/reset', { method: 'POST' })
  }

  /** Synchronise le joueur : graines des fascicules parus, puis état confirmé. */
  etat(): Promise<Etat> {
    return this.authentifie('/etat')
  }

  /** Tente une fusion. Un `409` (état ou catalogue périmé) impose une resynchronisation. */
  fusion(demande: DemandeFusion): Promise<ReponseFusion> {
    return this.authentifie('/fusion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  }

  /** Ouvre le pli d'un fascicule : le serveur tire la brique. `403` sans charge, `409` si l'état est périmé. */
  pli(demande: DemandePli): Promise<ReponsePli> {
    return this.authentifie('/pli', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  }

  /** Utilise des sabliers détenus : `403` si l'énergie est pleine ou les sabliers insuffisants. */
  sablier(demande: DemandeSablier): Promise<ReponseSablier> {
    return this.authentifie('/sablier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  }

  /** Échange de l'encre contre des sabliers, 10 gouttes chacun : `403` sans assez d'encre. */
  achatSablier(demande: DemandeAchatSablier): Promise<ReponseAchatSablier> {
    return this.authentifie('/sablier/achat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  }

  /** Achète le niveau suivant d'un indice : `403` sans assez d'encre, `409` si la recette est découverte. */
  indice(demande: DemandeIndice): Promise<ReponseIndice> {
    return this.authentifie('/indice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  }

  /** Tire une séance de ricochets : cinq questions au plus, par identifiants. Rien n'est écrit. */
  seanceRicochets(): Promise<SeanceRicochets> {
    return this.authentifie('/ricochets/seance')
  }

  /** Répond à une question de ricochet : `403` carte inconnue ou pas trouvée, `409` si l'état est périmé. */
  ricochet(demande: DemandeRicochet): Promise<ReponseRicochet> {
    return this.authentifie('/ricochet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  }

  /** Récupère la récompense d'un jalon atteint : `403` s'il n'est pas atteint, `409` s'il est déjà récupéré. */
  jalon(demande: DemandeJalon): Promise<ReponseJalon> {
    return this.authentifie('/jalon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  }

  /** Récupère la récompense d'un palier de quête au long cours : `403` s'il n'est pas atteint, `409` s'il est déjà récupéré. */
  palier(demande: DemandePalier): Promise<ReponsePalier> {
    return this.authentifie('/palier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  }
}

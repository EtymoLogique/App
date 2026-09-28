// Client de l'API de jeu. Le serveur fait foi (ADR 0007) : le client
// n'invente jamais un résultat à partir d'une erreur.

import type { DemandeFusion, DemandeIndice, DemandePli, DemandeSablier, Erreur, Etat, ReponseFusion, ReponseIndice, ReponsePli, ReponseSablier, Sante, Session } from '../contrat'
import { profilLocal } from './profil'

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

export class ClientApi {
  private session: Session | undefined
  private readonly base: string
  private readonly lireProfil: typeof profilLocal

  constructor(base: string, lireProfil = profilLocal) {
    this.base = base
    this.lireProfil = lireProfil
  }

  private async appeler<T>(chemin: string, init: RequestInit = {}): Promise<T> {
    let reponse: Response
    try {
      reponse = await fetch(`${this.base}${chemin}`, { ...init, credentials: 'omit', cache: 'no-store' })
    } catch {
      throw new ErreurApi(0, 'reseau', 'API injoignable')
    }
    const corps: unknown = await reponse.json().catch(() => undefined)
    if (!reponse.ok) {
      const erreur = corps as Partial<Erreur> | undefined
      throw new ErreurApi(reponse.status, erreur?.code ?? 'interne', erreur?.message ?? reponse.statusText)
    }
    return corps as T
  }

  sante(): Promise<Sante> {
    return this.appeler('/sante')
  }

  /** Ouvre la session si besoin, ou la renouvelle avant son expiration. */
  async ouvrirSession(): Promise<Session> {
    if (this.session && Date.parse(this.session.expire_le) - Date.now() > MARGE_MS) return this.session
    const profil = await this.lireProfil()
    this.session = await this.appeler<Session>('/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profil),
    })
    return this.session
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

  /** Utilise des sabliers : `403` si l'énergie est pleine, le plafond du jour atteint ou l'encre insuffisante. */
  sablier(demande: DemandeSablier): Promise<ReponseSablier> {
    return this.authentifie('/sablier', {
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
}

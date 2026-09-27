// Client de l'API de jeu. Le serveur fait foi (ADR 0007) : le client
// n'invente jamais un résultat à partir d'une erreur.

import type { Erreur, Etat, Sante, Session } from '../contrat'
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

  async etat(): Promise<Etat> {
    const { jeton } = await this.ouvrirSession()
    try {
      return await this.appeler<Etat>('/etat', { headers: { Authorization: `Bearer ${jeton}` } })
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) {
        this.session = undefined
        const nouvelle = await this.ouvrirSession()
        return this.appeler<Etat>('/etat', { headers: { Authorization: `Bearer ${nouvelle.jeton}` } })
      }
      throw e
    }
  }
}

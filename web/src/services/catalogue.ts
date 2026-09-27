// Lecture du catalogue publié sur le CDN (ADR 0027) : l'index global, seul
// fichier modifiable, puis les manifestes et ressources sous l'empreinte
// SHA-256 de leur contenu. Chaque fichier haché est vérifié avant usage.

import type { Calendrier, Manifeste } from '../contrat'

export const FORMAT = 1
const CHEMIN = /^(?:[fr]\/[0-9a-f]{64}\.json|a\/[0-9a-f]{64}\.svg)$/

export class ErreurCatalogue extends Error {}

export function cheminValide(chemin: string): boolean {
  return CHEMIN.test(chemin)
}

async function empreinte(octets: ArrayBuffer): Promise<string> {
  const condensat = new Uint8Array(await crypto.subtle.digest('SHA-256', octets))
  return Array.from(condensat, (o) => o.toString(16).padStart(2, '0')).join('')
}

export class LecteurCatalogue {
  private readonly base: string

  constructor(base: string) {
    this.base = base
  }

  /** Adresse d'un fichier haché, par exemple une jaquette à afficher. */
  url(chemin: string): string {
    if (!cheminValide(chemin)) throw new ErreurCatalogue(`Chemin refusé : ${chemin}`)
    return `${this.base}/${chemin}`
  }

  /** L'index est revalidé à chaque lancement ; `null` tant que rien n'est paru. */
  async index(): Promise<Calendrier | null> {
    const reponse = await fetch(`${this.base}/index.json`, { cache: 'no-cache', credentials: 'omit' })
    // Sans droit de listage, un objet absent répond 403.
    if (reponse.status === 403 || reponse.status === 404) return null
    if (!reponse.ok) throw new ErreurCatalogue(`Index illisible (${reponse.status})`)
    const index = (await reponse.json()) as Calendrier
    if (index.format !== FORMAT) throw new ErreurCatalogue(`Format ${index.format} non pris en charge`)
    return index
  }

  async fichierHache(chemin: string): Promise<ArrayBuffer> {
    const reponse = await fetch(this.url(chemin), { credentials: 'omit' })
    if (!reponse.ok) throw new ErreurCatalogue(`Fichier illisible (${reponse.status})`)
    const octets = await reponse.arrayBuffer()
    if ((await empreinte(octets)) !== chemin.slice(2, 66)) throw new ErreurCatalogue(`Empreinte incorrecte : ${chemin}`)
    return octets
  }

  async manifeste(chemin: string): Promise<Manifeste> {
    const manifeste = JSON.parse(new TextDecoder().decode(await this.fichierHache(chemin))) as Manifeste
    if (manifeste.format !== FORMAT) throw new ErreurCatalogue(`Format ${manifeste.format} non pris en charge`)
    return manifeste
  }
}

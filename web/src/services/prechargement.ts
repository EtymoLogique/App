// Préchargement du catalogue (ADR 0085) : pendant que le réseau est bon, les
// médias des fascicules parus (silhouettes, jaquettes) passent par le service
// worker, qui les garde (`catalogue-hache`, CacheFirst). Dans un tunnel, le
// codex reste alors complet. Rien n'est vérifié ni décodé ici : la lecture
// réelle vérifie toujours l'empreinte (`LecteurCatalogue.fichierHache`).

import type { LecteurCatalogue } from './catalogue'
import type { CatalogueJeu } from './jeu'
import { type Reseau, reseau as reseauGlobal } from './reseau'

/** Requêtes de préchargement simultanées : le jeu garde la priorité. */
const EN_PARALLELE = 3

/** Chemins des médias à garder hors connexion : silhouettes des cartes et jaquettes des fascicules. */
export function mediasDuCatalogue(jeu: CatalogueJeu): string[] {
  const chemins = new Set<string>()
  for (const { manifeste } of jeu.fascicules) {
    if (manifeste.jaquette) chemins.add(manifeste.jaquette)
    for (const c of [...(manifeste.cartes ?? []), ...(manifeste.langues ?? [])]) if (c.silhouette) chemins.add(c.silhouette)
  }
  return [...chemins]
}

/** Vrai si le joueur a demandé d'économiser ses données : on ne précharge rien. */
function economieDeDonnees(): boolean {
  const connexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return connexion?.saveData === true
}

/**
 * Charge les médias un à un, trois à la fois, et s'arrête dès que le réseau
 * n'est plus franchement en ligne. Renvoie le nombre de médias chargés.
 */
export async function prechargerMedias(jeu: CatalogueJeu, lecteur: LecteurCatalogue, source: Reseau = reseauGlobal, signal?: AbortSignal): Promise<number> {
  if (economieDeDonnees()) return 0
  const file = mediasDuCatalogue(jeu)
  let charges = 0
  const ouvrier = async () => {
    for (let chemin = file.shift(); chemin !== undefined; chemin = file.shift()) {
      if (signal?.aborted || source.lire().niveau !== 'en_ligne') return
      try {
        const reponse = await fetch(lecteur.url(chemin), { credentials: 'omit', signal })
        if (reponse.ok) {
          await reponse.arrayBuffer()
          charges++
        }
      } catch {
        return
      }
    }
  }
  await Promise.all(Array.from({ length: EN_PARALLELE }, ouvrier))
  return charges
}

/** Lance le préchargement quand le navigateur est inactif. Renvoie de quoi l'annuler. */
export function prechargerAuRepos(jeu: CatalogueJeu, lecteur: LecteurCatalogue, source: Reseau = reseauGlobal): () => void {
  const controleur = new AbortController()
  const lancer = () => void prechargerMedias(jeu, lecteur, source, controleur.signal)
  const fenetre = window as Window & { requestIdleCallback?: (rappel: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
  if (fenetre.requestIdleCallback) {
    const id = fenetre.requestIdleCallback(lancer, { timeout: 10_000 })
    return () => {
      fenetre.cancelIdleCallback?.(id)
      controleur.abort()
    }
  }
  const minuteur = setTimeout(lancer, 3_000)
  return () => {
    clearTimeout(minuteur)
    controleur.abort()
  }
}

/** Demande au navigateur de ne pas vider la partie locale ni le catalogue gardé. */
export function demanderStockagePersistant(): void {
  void navigator.storage?.persist?.().catch(() => false)
}

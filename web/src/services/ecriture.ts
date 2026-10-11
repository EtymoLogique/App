// Plume du rituel d'ouverture : écriture lettre à lettre des brouillons barrés, puis de la brique (Plis.tsx, PlisGroupes.tsx).

import type { Dispatch, SetStateAction } from 'react'

import { type CatalogueJeu, NATURES } from './jeu'

/** Glyphes inventés que la plume essaie avant d'écrire la brique (plis.html). */
export const INVENT = Array.from('ꜳꝏƺȣǂꞷʘƨƾȹꭥꝭꜧƕξψϡϟϠѦ')
export const auHasard = <T>(liste: T[]): T => liste[Math.floor(Math.random() * liste.length)] as T
export const bruit = (n: number) => Array.from({ length: n }, () => auHasard(INVENT)).join('')

const VOYELLES = /[aeiouyàâäéèêëîïôöùûüœæαεηιουωάέήίόύώ]/i
/** Coupe syllabique naïve : avant une consonne entre deux voyelles, la plume marque une pause. */
const coupe = (lettres: string[], i: number) =>
  i > 1 && i < lettres.length - 1 && VOYELLES.test(lettres[i - 1] ?? '') && !VOYELLES.test(lettres[i] ?? '') && VOYELLES.test(lettres[i + 1] ?? '')

export interface Ligne {
  cle: number
  texte: string
  finale: boolean
  nature?: string
  barree?: boolean
  ancienne?: boolean
  encree?: boolean
  saisie: boolean
}

/** Rythme de la plume : lent pour la brique finale, rapide pour un brouillon ou le rituel court. */
export interface Rythme {
  lettre: number
  syllabe: number
}

export type MajLignes = Dispatch<SetStateAction<Ligne[]>>
export type Pause = (ms: number) => Promise<void>

/**
 * Écriture à un rythme humain : chaque lettre essaie d'abord un glyphe inventé, la plume marque une pause aux
 * syllabes et accélère sur les lettres déjà écrites dans un brouillon (`connues`).
 */
export function creerPlume(majLignes: MajLignes, pause: Pause, interrompu: () => boolean) {
  return async (texte: string, finale: boolean, rythme: Rythme, connues: ReadonlySet<string>, nature?: string): Promise<number> => {
    const cle = Math.random()
    majLignes((ls) => [...ls.map((l) => ({ ...l, ancienne: true })).slice(-2), { cle, texte: '', finale, nature, saisie: true }])
    const lettres = Array.from(texte)
    for (let i = 0; i < lettres.length; i++) {
      if (interrompu()) break
      if (coupe(lettres, i)) await pause(rythme.syllabe)
      const vu = lettres.slice(0, i).join('')
      const connue = connues.has((lettres[i] ?? '').toLowerCase())
      if (!connue) {
        majLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, texte: vu + auHasard(INVENT) } : l)))
        await pause(18)
      }
      majLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, texte: vu + lettres[i] } : l)))
      await pause(connue ? rythme.lettre / 2 : rythme.lettre)
    }
    majLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, texte, saisie: false } : l)))
    return cle
  }
}

/** Brouillons de la plume : des glyphes inventés, puis la forme d'origine et sa translittération ; sans étymon, deux essais inventés. */
export function brouillons(jeu: CatalogueJeu, briqueId: string): string[] {
  const brique = jeu.briques.get(briqueId)
  const carte = brique ? jeu.cartes.get(brique.uniteId) : undefined
  const etymon = carte?.relations?.find((r) => r.etymon)?.etymon
  const origine = [etymon?.forme.texte, etymon?.forme.translitterations?.[0]?.texte].filter((t): t is string => Boolean(t))
  return [bruit(4), ...(origine.length > 0 ? origine : [bruit(5)])]
}

export interface RituelEcrit {
  jeu: CatalogueJeu
  briqueId: string
  majLignes: MajLignes
  pause: Pause
  interrompu: () => boolean
  /** Rituel court des plis ouverts ensemble : la plume va plus vite, avec un brouillon de moins pour une brique ordinaire. */
  court?: boolean
}

/** Écriture complète du rituel : brouillons barrés (rature à la main), puis la brique dans son cadre, qui s'encre. */
export async function ecrireRituel({ jeu, briqueId, majLignes, pause, interrompu, court = false }: RituelEcrit): Promise<void> {
  const ecrire = creerPlume(majLignes, pause, interrompu)
  const brique = jeu.briques.get(briqueId)
  const connues = new Set<string>()
  const essais = brouillons(jeu, briqueId)
  for (const brouillon of court ? essais.slice(0, 2) : essais) {
    const cle = await ecrire(brouillon, false, court ? { lettre: 20, syllabe: 30 } : { lettre: 26, syllabe: 50 }, connues)
    Array.from(brouillon.toLowerCase()).forEach((c) => connues.add(c))
    await pause(court ? 40 : 60)
    // Rature tracée à la main (.sc-rature, 200 ms).
    majLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, barree: true } : l)))
    await pause(court ? 110 : 170)
  }
  // Seuls préfixes et suffixes s'écrivent dans un cadre de brique coloré ; un mot reste en serif.
  const nature = brique && brique.nature !== 'mot' ? NATURES[brique.nature] : undefined
  const finale = await ecrire(brique?.libelle ?? '…', true, court ? { lettre: 32, syllabe: 50 } : { lettre: 48, syllabe: 90 }, connues, nature)
  majLignes((ls) => ls.map((l) => (l.cle === finale ? { ...l, encree: true } : l)))
  await pause(court ? 90 : 130)
}

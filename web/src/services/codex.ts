// Le codex (game-design, codex.html) : une carte par unité déclarée par un
// fascicule paru, et une par langue citée. Une carte trouvée montre son mot et
// sa texture ; une carte à trouver reste en silhouette avec sa piste. Une
// légendaire inconnue, et tout mot qui en dépend, n'apparaissent jamais (ADR 0015).

import type { Carte, Confiance, Etat, Forme, Rarete } from '../contrat'
import { type CatalogueJeu, definition, formeCanonique, libelle } from './jeu'

export type TypeCarte = 'mot' | 'prefixe' | 'suffixe' | 'langue'

export const TYPES: Record<TypeCarte, { libelle: string; pluriel: string }> = {
  mot: { libelle: 'Mot', pluriel: 'Mots' },
  prefixe: { libelle: 'Préfixe', pluriel: 'Préfixes' },
  suffixe: { libelle: 'Suffixe', pluriel: 'Suffixes' },
  langue: { libelle: 'Langue', pluriel: 'Langues' },
}
export const ORDRE_TYPES: TypeCarte[] = ['mot', 'prefixe', 'suffixe', 'langue']

export const CONFIANCES: Record<Confiance, string> = {
  etablie: 'Établie',
  probable: 'Probable',
  discutee: 'Discutée',
  non_retenue: 'Non retenue',
}

export interface FormeTrouvee {
  langueId: string
  texte: string
  translitteration: string | null
  trouvee: boolean
  /** Le mot où elle apparaît, pour les formes d'une carte de langue. */
  dans?: string
}

export interface Lien {
  libelle: string
  nature: Carte['nature']
  trouve: boolean
}

export interface EntreeCodex {
  id: string
  n: number
  fascicule: number
  type: TypeCarte
  trouvee: boolean
  /** Mot, brique à trait d'union ou nom de langue. */
  libelle: string
  /** Sens littéral (mot) ou glose (brique) : la piste d'une carte à trouver. */
  sens: string | null
  definition: string | null
  langueId: string | null
  rarete: Rarete | null
  legendaire: boolean
  silhouette: string | null
  confiance: Confiance | null
  carte: Carte | null
  formes: FormeTrouvee[]
  /** Vrai pour un mot résultat d'une recette : il compte parmi les découvertes. */
  resultat: boolean
  /** Composants d'un mot, ou mots formés par une brique. */
  liens: { titre: 'Composants' | 'Mots formés'; items: Lien[] } | null
}

function formesDe(carte: Carte, trouvee: boolean): FormeTrouvee[] {
  const formes: FormeTrouvee[] = []
  const canonique = formeCanonique(carte)
  if (canonique) formes.push({ langueId: carte.langue_id, texte: canonique.texte, translitteration: null, trouvee })
  for (const relation of carte.relations ?? []) {
    const etymon = relation.etymon
    if (!etymon) continue
    formes.push({
      langueId: etymon.langue_id,
      texte: etymon.forme.texte,
      translitteration: etymon.forme.translitterations?.[0]?.texte ?? null,
      trouvee,
    })
  }
  return formes
}

function sensLitteral(carte: Carte): string | null {
  const compositions = carte.compositions ?? []
  const composition = compositions.find((c) => c.preferee) ?? compositions[0]
  return composition?.libelles.fr?.sens_litteral ?? null
}

function glose(carte: Carte): string | null {
  const sens = carte.sens.find((s) => s.id === carte.brique?.sens_affiche_id) ?? carte.sens[0]
  return sens?.libelles.fr?.glose ?? null
}

/** Construit les cartes du codex pour les fascicules parus et l'état du joueur. */
export function construireCodex(jeu: CatalogueJeu, etat: Etat | null, urlMedia: (chemin: string) => string): EntreeCodex[] {
  const decouverts = new Set(etat?.decouvertes.map((d) => d.mot_id) ?? [])
  const connues = new Set(etat?.reserve.map((e) => e.brique_id) ?? [])
  const legendaires = new Set([...jeu.briques.values()].filter((b) => b.rarete === 'legendaire').map((b) => b.id))
  const entrees: EntreeCodex[] = []
  const vus = new Set<string>()
  let n = 0

  const trouvee = (carte: Carte) =>
    decouverts.has(carte.id) || (carte.brique ? connues.has(carte.brique.id) : false)

  for (const fascicule of jeu.fascicules) {
    for (const ref of fascicule.manifeste.cartes ?? []) {
      const carte = jeu.cartes.get(ref.id)
      if (!carte || vus.has(carte.id)) continue
      vus.add(carte.id)
      n += 1
      const estTrouvee = trouvee(carte)
      const recettes = jeu.recettes.filter((r) => r.motId === carte.id)
      const legendaire = carte.brique?.rarete === 'legendaire'
      const dependDUneLegendaire = recettes.some((r) => r.emplacements.some((e) => e.some((b) => legendaires.has(b))))
      // Rien ne trahit une légendaire inconnue, ni les mots qui en dépendent.
      if (!estTrouvee && (legendaire || dependDUneLegendaire)) continue
      const affixe = carte.nature !== 'mot'
      const forme = formeCanonique(carte)?.texte ?? ''
      let liens: EntreeCodex['liens'] = null
      if (!affixe) {
        const composition = (carte.compositions ?? []).find((c) => c.preferee) ?? carte.compositions?.[0]
        const parties = [...(composition?.parties ?? [])].sort((a, b) => a.rang - b.rang)
        if (parties.length > 0) {
          liens = {
            titre: 'Composants',
            items: parties.map((p) => {
              const partie = jeu.cartes.get(p.unite_id)
              return {
                libelle: partie ? libelle(partie.nature, formeCanonique(partie)?.texte ?? '') : '…',
                nature: partie?.nature ?? 'mot',
                trouve: partie ? trouvee(partie) : false,
              }
            }),
          }
        }
      }
      if (carte.brique) {
        const brique = carte.brique.id
        const mots = jeu.recettes.filter((r) => r.emplacements.some((e) => e.includes(brique)))
        if (mots.length > 0 && affixe) {
          liens = {
            titre: 'Mots formés',
            items: mots.map((r) => {
              const mot = jeu.cartes.get(r.motId)
              return { libelle: mot ? (formeCanonique(mot)?.texte ?? '…') : '…', nature: 'mot' as const, trouve: decouverts.has(r.motId) }
            }),
          }
        }
      }
      entrees.push({
        id: carte.id,
        n,
        fascicule: fascicule.numero,
        type: carte.nature,
        trouvee: estTrouvee,
        resultat: recettes.length > 0,
        libelle: libelle(carte.nature, forme),
        sens: affixe ? glose(carte) : (sensLitteral(carte) ?? glose(carte)),
        definition: definition(carte),
        langueId: carte.langue_id,
        // La rareté est celle d'une brique élémentaire : une carte de mot n'en porte jamais (codex.html).
        rarete: affixe ? (carte.brique?.rarete ?? null) : null,
        legendaire,
        silhouette: ref.silhouette ? urlMedia(ref.silhouette) : null,
        confiance: carte.fait?.confiance ?? null,
        carte,
        formes: formesDe(carte, estTrouvee),
        liens,
      })
    }
    for (const ref of fascicule.manifeste.langues ?? []) {
      if (vus.has(ref.id)) continue
      vus.add(ref.id)
      n += 1
      const nom = jeu.langues.get(ref.id) ?? '…'
      entrees.push({
        id: ref.id,
        n,
        fascicule: fascicule.numero,
        type: 'langue',
        trouvee: false,
        resultat: false,
        libelle: nom.charAt(0).toUpperCase() + nom.slice(1),
        sens: null,
        definition: null,
        langueId: ref.id,
        rarete: null,
        legendaire: false,
        silhouette: ref.silhouette ? urlMedia(ref.silhouette) : null,
        confiance: null,
        carte: null,
        formes: [],
        liens: null,
      })
    }
  }

  // Une langue est trouvée dès qu'une carte trouvée l'emploie ; ses formes sont celles des autres cartes.
  for (const langue of entrees.filter((e) => e.type === 'langue')) {
    const formes: FormeTrouvee[] = []
    for (const e of entrees) {
      if (e.type === 'langue') continue
      for (const f of e.formes) if (f.langueId === langue.id) formes.push({ ...f, dans: e.trouvee ? e.libelle : undefined })
    }
    formes.sort((a, b) => Number(b.trouvee) - Number(a.trouvee))
    langue.formes = formes
    langue.trouvee = formes.some((f) => f.trouvee)
  }
  return entrees
}

/** Complétude : les légendaires ne comptent jamais, pour garder le suspense (ADR 0015). */
export function completude(entrees: EntreeCodex[]): { trouvees: number; total: number; legendaires: number } {
  const comptees = entrees.filter((e) => !e.legendaire)
  return {
    trouvees: comptees.filter((e) => e.trouvee).length,
    total: comptees.length,
    legendaires: entrees.filter((e) => e.legendaire && e.trouvee).length,
  }
}

/** Silhouette d'un texte inconnu : ni ses lettres, ni plus de 9 points. */
export function silhouetteDe(texte: string): string {
  return '•'.repeat(Math.min(Math.max(Array.from(texte).length, 3), 9))
}

export type { Forme }

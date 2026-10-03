// Le codex (game-design, codex.html) : une carte par unité déclarée par un
// fascicule paru, et une par langue citée. Une carte trouvée montre son mot et
// sa texture ; une carte à trouver reste en silhouette avec sa piste. Une
// légendaire inconnue, et tout mot qui en dépend, n'apparaissent jamais (ADR 0015).

import type { Carte, Confiance, Etat, Forme, Rarete } from '../contrat'
import { type CatalogueJeu, definition, formeCanonique, libelle, rareteMot } from './jeu'
import { correspond } from './recherche'

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
  /** Le mot où elle apparaît, pour les formes d'une carte de langue, et sa carte. */
  dans?: string
  dansId?: string
}

export interface Lien {
  /** Carte visée : l'unité du composant ou du mot formé. */
  id: string
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
  /** Date de la découverte d'un mot, ou de la première obtention d'une brique. */
  trouveeLe: string | null
  /** Mot, brique à trait d'union ou nom de langue. */
  libelle: string
  /** Sens littéral (mot) ou glose (brique) : la piste d'une carte à trouver. */
  sens: string | null
  definition: string | null
  langueId: string | null
  /** Lettre emblème d'une carte de langue. */
  glyphe: string | null
  rarete: Rarete | null
  legendaire: boolean
  /** Chemin haché de la silhouette dans le catalogue. */
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

function plusTot(a: string | undefined, b: string | undefined): string | null {
  if (!a || !b) return a ?? b ?? null
  return Date.parse(a) <= Date.parse(b) ? a : b
}

/** Construit les cartes du codex pour les fascicules parus et l'état du joueur. */
export function construireCodex(jeu: CatalogueJeu, etat: Etat | null): EntreeCodex[] {
  const decouvertes = new Map(etat?.decouvertes.map((d) => [d.mot_id, d.decouverte_le]) ?? [])
  const connues = new Map(etat?.reserve.map((e) => [e.brique_id, e.connue_le]) ?? [])
  const decouverts = new Set(decouvertes.keys())
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
                id: p.unite_id,
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
              return { id: r.motId, libelle: mot ? (formeCanonique(mot)?.texte ?? '…') : '…', nature: 'mot' as const, trouve: decouverts.has(r.motId) }
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
        trouveeLe: estTrouvee ? plusTot(decouvertes.get(carte.id), carte.brique ? connues.get(carte.brique.id) : undefined) : null,
        resultat: recettes.length > 0,
        libelle: libelle(carte.nature, forme),
        sens: affixe ? glose(carte) : (sensLitteral(carte) ?? glose(carte)),
        definition: definition(carte),
        langueId: carte.langue_id,
        glyphe: null,
        // Un affixe porte la rareté de sa brique ; un mot, celle que ses briques lui donnent,
        // et la plus basse s'il ne naît d'aucune fusion (ADR 0040).
        rarete: affixe ? (carte.brique?.rarete ?? null) : rareteMot(carte.id, jeu),
        legendaire,
        silhouette: ref.silhouette ?? null,
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
        trouveeLe: null,
        resultat: false,
        libelle: nom.charAt(0).toUpperCase() + nom.slice(1),
        sens: null,
        definition: null,
        langueId: ref.id,
        glyphe: jeu.glyphes.get(ref.id) ?? nom.charAt(0).toUpperCase(),
        rarete: null,
        legendaire: false,
        silhouette: ref.silhouette ?? null,
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
      for (const f of e.formes) if (f.langueId === langue.id) formes.push({ ...f, dans: e.trouvee ? e.libelle : undefined, dansId: e.trouvee ? e.id : undefined })
    }
    formes.sort((a, b) => Number(b.trouvee) - Number(a.trouvee))
    langue.formes = formes
    langue.trouvee = formes.some((f) => f.trouvee)
    // Une langue est rencontrée avec la première carte trouvée qui l'emploie.
    langue.trouveeLe =
      entrees
        .filter((e) => e.type !== 'langue' && e.trouvee && e.formes.some((f) => f.langueId === langue.id))
        .reduce<string | null>((date, e) => plusTot(date ?? undefined, e.trouveeLe ?? undefined), null)
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

// ------------------------------------------------------------------ recherche

export interface GroupeRecherche {
  titre: 'Briques' | 'Mots' | 'Langues'
  entrees: EntreeCodex[]
}

/**
 * Recherche dans le codex (I-17) : par forme ou par sens, parmi les seules
 * cartes trouvées. Une silhouette n'est jamais trouvée, pas même par sa piste.
 */
export function rechercher(entrees: EntreeCodex[], requete: string): GroupeRecherche[] {
  if (requete.trim() === '') return []
  const trouvees = entrees.filter(
    (e) =>
      e.trouvee &&
      correspond(
        requete,
        e.libelle,
        e.sens,
        e.definition,
        ...e.formes.filter((f) => f.trouvee).flatMap((f) => [f.texte, f.translitteration]),
      ),
  )
  const groupes: GroupeRecherche[] = [
    { titre: 'Briques', entrees: trouvees.filter((e) => e.type === 'prefixe' || e.type === 'suffixe') },
    { titre: 'Mots', entrees: trouvees.filter((e) => e.type === 'mot') },
    { titre: 'Langues', entrees: trouvees.filter((e) => e.type === 'langue') },
  ]
  return groupes.filter((g) => g.entrees.length > 0)
}

// ------------------------------------------------------------------ vues

/** Découvertes récentes (game-design, « Vues ») : les dernières cartes trouvées, la plus récente d'abord. */
export const NB_RECENTES = 12

export function recentes(entrees: EntreeCodex[]): EntreeCodex[] {
  return entrees
    .filter((e) => e.trouvee && e.trouveeLe)
    .sort((a, b) => Date.parse(b.trouveeLe as string) - Date.parse(a.trouveeLe as string) || b.n - a.n)
    .slice(0, NB_RECENTES)
}

export interface Famille {
  /** La brique qui forme la famille. */
  brique: EntreeCodex
  /** Mots formés, trouvés ou en silhouette, hors légendaires cachées. */
  mots: EntreeCodex[]
  trouves: number
}

/**
 * Familles : les mots formés sur une brique trouvée (codex.html, « au verso
 * d'une brique, la famille des mots qu'elle forme se complète »). Le catalogue
 * ne déclare pas encore de familles éditoriales (modèle de données, questions
 * ouvertes) : la famille se déduit des recettes. Les familles en cours d'abord,
 * les plus avancées en tête ; les complètes à la fin.
 */
export function familles(entrees: EntreeCodex[], jeu: CatalogueJeu): Famille[] {
  const parId = new Map(entrees.map((e) => [e.id, e]))
  const resultat: Famille[] = []
  for (const brique of entrees) {
    const id = brique.carte?.brique?.id
    if (!brique.trouvee || !id) continue
    const ids = new Set(jeu.recettes.filter((r) => r.emplacements.some((e) => e.includes(id))).map((r) => r.motId))
    const mots = [...ids].flatMap((m) => parId.get(m) ?? []).sort((a, b) => a.n - b.n)
    if (mots.length === 0) continue
    resultat.push({ brique, mots, trouves: mots.filter((m) => m.trouvee).length })
  }
  const complete = (f: Famille) => f.trouves === f.mots.length
  return resultat.sort(
    (a, b) =>
      Number(complete(a)) - Number(complete(b)) ||
      b.trouves / b.mots.length - a.trouves / a.mots.length ||
      a.brique.n - b.brique.n,
  )
}

// ------------------------------------------------------------ en savoir plus

export const CERTITUDES: Record<Confiance, string> = {
  etablie: 'au moins une source de référence l’affirme',
  probable: 'une source de référence la présente comme une hypothèse',
  discutee: 'des sources de référence sont en désaccord',
  non_retenue: 'analyse écartée',
}

export interface RelationHistorique {
  /** Brique concernée, pour une relation d'un composant (« géo- »). */
  de: { id: string; libelle: string; nature: Carte['nature'] } | null
  type: string
  texte: string
  translitteration: string | null
  glose: string | null
  langue: string | null
}

export interface SourceAffichee {
  id: string
  reference: string
  detail: string
  url: string | null
}

export interface SavoirPlus {
  /** Chemin des langues en toutes lettres, de l'origine au mot. */
  chemin: { id: string; nom: string }[]
  relations: RelationHistorique[]
  transformations: { type: string; texte: string; partie: string | null }[]
  confiance: Confiance | null
  sources: SourceAffichee[]
}

function nomDeLangue(jeu: CatalogueJeu, id: string): string | null {
  const nom = jeu.langues.get(id)
  return nom ? nom.charAt(0).toUpperCase() + nom.slice(1) : null
}

/**
 * Section « En savoir plus » d'une carte trouvée (I-16) : relation historique,
 * transformations, niveau de certitude et sources citées. Tout vient de la
 * carte publiée ; rien n'est déduit au-delà.
 */
export function savoirPlus(entree: EntreeCodex, jeu: CatalogueJeu): SavoirPlus | null {
  const carte = entree.carte
  if (!carte || !entree.trouvee) return null
  const compositions = carte.compositions ?? []
  const composition = compositions.find((c) => c.preferee) ?? compositions[0]
  const parties = [...(composition?.parties ?? [])].sort((a, b) => a.rang - b.rang)

  const relationsDe = (c: Carte, de: RelationHistorique['de']): RelationHistorique[] =>
    (c.relations ?? []).flatMap((r) =>
      r.etymon
        ? [
            {
              de,
              type: jeu.typesRelation.get(r.type_code) ?? r.type_code.replaceAll('_', ' '),
              texte: r.etymon.forme.texte,
              translitteration: r.etymon.forme.translitterations?.[0]?.texte ?? null,
              glose: r.etymon.sens?.[0]?.libelles.fr?.glose ?? null,
              langue: nomDeLangue(jeu, r.etymon.langue_id),
            },
          ]
        : [],
    )
  const relations = relationsDe(carte, null)
  for (const p of parties) {
    const partie = jeu.cartes.get(p.unite_id)
    if (!partie) continue
    const nom = libelle(partie.nature, formeCanonique(partie)?.texte ?? '')
    relations.push(...relationsDe(partie, { id: partie.id, libelle: nom, nature: partie.nature }))
  }

  // Des langues d'origine vers celle du mot, sans doublon.
  const chemin: SavoirPlus['chemin'] = []
  const origines = [...(carte.relations ?? []), ...parties.flatMap((p) => jeu.cartes.get(p.unite_id)?.relations ?? [])]
  for (const id of [...origines.flatMap((r) => (r.etymon ? [r.etymon.langue_id] : [])), carte.langue_id]) {
    const nom = nomDeLangue(jeu, id)
    if (nom && !chemin.some((c) => c.id === id)) chemin.push({ id, nom })
  }
  // L'origine d'abord : la langue du mot ferme toujours le chemin.
  const langue = chemin.findIndex((c) => c.id === carte.langue_id)
  if (langue >= 0) chemin.push(...chemin.splice(langue, 1))

  const transformations = [...(composition?.transformations ?? [])]
    .sort((a, b) => a.ordre - b.ordre)
    .map((t) => {
      const partie = parties.find((p) => p.rang === t.rang_partie)
      const unite = partie ? jeu.cartes.get(partie.unite_id) : undefined
      return {
        type: jeu.typesTransformation.get(t.type_code) ?? t.type_code.replaceAll('_', ' '),
        texte: t.libelles.fr?.texte ?? '',
        partie: unite ? libelle(unite.nature, formeCanonique(unite)?.texte ?? '') : null,
      }
    })

  const sources = Object.values(carte.sources ?? {}).map((s) => ({
    id: s.id,
    reference: s.reference,
    detail: [s.role === 'reference' ? 'Référence' : null, s.type, s.edition].filter(Boolean).join(' · '),
    url: s.url && /^https:\/\//.test(s.url) ? s.url : null,
  }))

  return {
    chemin: chemin.length > 1 ? chemin : [],
    relations,
    transformations,
    confiance: composition?.fait?.confiance ?? carte.fait?.confiance ?? null,
    sources,
  }
}

export type { Forme }

// ------------------------------------------------------------------ cabinet

export interface Cabinet {
  mots: number
  langues: number
  /** Légendaires trouvées : un nombre seul, jamais leur total (ADR 0043). */
  legendaires: number
  /** Mot trouvé dont la filiation traverse le plus de langues, de l'origine au mot. */
  voyage: { mot: EntreeCodex; langues: string[] } | null
}

/**
 * Votre cabinet (I-30, ADR 0050) : les nombres que le client tire du codex.
 * Les jours de jeu viennent du serveur (`Etat.jours_de_jeu`).
 */
export function cabinet(entrees: EntreeCodex[], jeu: CatalogueJeu): Cabinet {
  const mots = entrees.filter((e) => e.type === 'mot' && e.trouvee)
  let voyage: Cabinet['voyage'] = null
  for (const mot of mots) {
    const chemin = savoirPlus(mot, jeu)?.chemin ?? []
    const langues = chemin.length > 0 ? chemin.map((c) => c.nom) : [nomDeLangue(jeu, mot.langueId ?? '')].flatMap((n) => n ?? [])
    // À égalité, le plus récemment trouvé.
    const plusRecent = Date.parse(mot.trouveeLe ?? '') > Date.parse(voyage?.mot.trouveeLe ?? '')
    if (!voyage || langues.length > voyage.langues.length || (langues.length === voyage.langues.length && plusRecent)) voyage = { mot, langues }
  }
  return {
    mots: mots.length,
    langues: entrees.filter((e) => e.type === 'langue' && e.trouvee).length,
    legendaires: completude(entrees).legendaires,
    voyage,
  }
}

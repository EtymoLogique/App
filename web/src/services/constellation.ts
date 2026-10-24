// Vue Réseau du codex (App#91) : la constellation en deux rives. Les briques
// trouvées du 1er emplacement des recettes à gauche, celles du 2ᵈ à droite, une
// bande par fascicule ; chaque mot trouvé est une courbe qui traverse la
// « rivière » entre ses deux briques. Tout se calcule ici, sur la projection du
// codex : une fonction pure et déterministe, que le composant ne fait que dessiner.
//
// Garde-fous : seules les briques et les mots trouvés apparaissent (ADR 0051),
// jamais une légendaire (ADR 0043), jamais un fascicule verrouillé (ADR 0069).
// La difficulté n'est jamais lue (ADR 0047).

import type { Carte } from '../contrat'
import type { EntreeCodex } from './codex'
import type { CatalogueJeu } from './jeu'

export type Cote = 'g' | 'd'

/** Un mot du réseau : trouvé ou non, toujours d'un fascicule débloqué, jamais légendaire. */
export interface MotReseau {
  id: string
  libelle: string
  fascicule: number
  trouve: boolean
  trouveLe: string | null
  /** Briques retenues pour le tracé : la première alternative trouvée de chaque emplacement. */
  gauche: string
  droite: string
}

export interface BriqueReseau {
  id: string
  libelle: string
  nature: Carte['nature']
  glose: string | null
  /** Unité de la brique : sa carte au codex. */
  uniteId: string
}

export interface Reseau {
  /** Mots des fascicules débloqués, hors légendaires : ils font les totaux des familles. */
  mots: MotReseau[]
  briques: Map<string, BriqueReseau>
  /** Fascicules débloqués, par numéro croissant, avec leur nom. */
  fascicules: { numero: number; nom: string }[]
}

/** Nœud du réseau : une brique sur une rive (une même brique peut tenir les deux). */
export const cle = (cote: Cote, brique: string) => `${cote}:${brique}`

/**
 * Le réseau du joueur. Une recette de deux emplacements seulement ; pour chaque
 * emplacement, la première brique trouvée parmi ses alternatives (une forme
 * d'allomorphe), sinon la première : un mot non trouvé ne compte que dans les totaux.
 */
export function construireReseau(jeu: CatalogueJeu, entrees: EntreeCodex[], debloques: Set<number>): Reseau {
  const parUnite = new Map(entrees.map((e) => [e.id, e]))
  const briqueTrouvee = (id: string) => {
    const b = jeu.briques.get(id)
    return b !== undefined && parUnite.get(b.uniteId)?.trouvee === true
  }
  const mots: MotReseau[] = []
  for (const recette of jeu.recettes) {
    if (recette.emplacements.length !== 2) continue
    const entree = parUnite.get(recette.motId)
    if (!entree || entree.legendaire || !debloques.has(entree.fascicule)) continue
    if (mots.some((m) => m.id === entree.id)) continue
    const choisir = (alternatives: string[]) => alternatives.find(briqueTrouvee) ?? alternatives[0]
    const gauche = choisir(recette.emplacements[0] ?? [])
    const droite = choisir(recette.emplacements[1] ?? [])
    if (!gauche || !droite) continue
    // Une brique légendaire ne s'affiche jamais : le mot n'entre pas dans le réseau.
    if ([gauche, droite].some((b) => jeu.briques.get(b)?.rarete === 'legendaire')) continue
    mots.push({ id: entree.id, libelle: entree.libelle, fascicule: entree.fascicule, trouve: entree.trouvee, trouveLe: entree.trouveeLe, gauche, droite })
  }
  const briques = new Map<string, BriqueReseau>()
  for (const m of mots) {
    for (const id of [m.gauche, m.droite]) {
      const b = jeu.briques.get(id)
      if (b && !briques.has(id)) briques.set(id, { id, libelle: b.libelle, nature: b.nature, glose: b.glose, uniteId: b.uniteId })
    }
  }
  const fascicules = jeu.fascicules
    .filter((f) => debloques.has(f.numero))
    .sort((a, b) => a.numero - b.numero)
    .map((f) => ({ numero: f.numero, nom: f.manifeste.nom ?? `Fascicule ${f.numero}` }))
  return { mots, briques, fascicules }
}

export type VueReseau = number | 'tous'

export interface Bande {
  numero: number
  g: string[]
  d: string[]
}

const alpha = new Intl.Collator('fr').compare

/** Mots trouvés que la vue couvre, et ses bandes : seules les briques de ces mots y figurent. */
export function portee(reseau: Reseau, vue: VueReseau): { mots: MotReseau[]; bandes: Bande[] } {
  const tous = vue === 'tous'
  // Vue d'ensemble : une brique tient la bande du premier fascicule dont un mot l'emploie, trouvé ou non,
  // pour qu'elle ne change pas de bande quand le joueur avance.
  const premiere = new Map<string, number>()
  for (const m of reseau.mots) {
    for (const k of [cle('g', m.gauche), cle('d', m.droite)]) premiere.set(k, Math.min(premiere.get(k) ?? Infinity, m.fascicule))
  }
  const mots = reseau.mots.filter((m) => m.trouve && (tous || m.fascicule === vue))
  const bandes = new Map<number, { g: Set<string>; d: Set<string> }>()
  for (const m of mots) {
    for (const [cote, b] of [['g', m.gauche], ['d', m.droite]] as const) {
      const numero = tous ? (premiere.get(cle(cote, b)) ?? m.fascicule) : m.fascicule
      if (!bandes.has(numero)) bandes.set(numero, { g: new Set(), d: new Set() })
      bandes.get(numero)![cote].add(b)
    }
  }
  const libelle = (id: string) => reseau.briques.get(id)?.libelle ?? id
  const trier = (ids: Set<string>) => [...ids].sort((a, b) => alpha(libelle(a), libelle(b)) || alpha(a, b))
  return {
    mots,
    bandes: [...bandes].sort(([a], [b]) => a - b).map(([numero, b]) => ({ numero, g: trier(b.g), d: trier(b.d) })),
  }
}

/** Famille d'une brique dans la vue : ses mots trouvés, et le total des fascicules débloqués que la vue couvre. */
export function famille(reseau: Reseau, brique: string, vue: VueReseau): { formes: MotReseau[]; trouves: number; total: number } {
  const siens = reseau.mots.filter((m) => (m.gauche === brique || m.droite === brique) && (vue === 'tous' || m.fascicule === vue))
  const formes = siens.filter((m) => m.trouve).sort((a, b) => alpha(a.libelle, b.libelle))
  return { formes, trouves: formes.length, total: siens.length }
}

/** Dernière découverte de la vue : elle seule passe en Corail. */
export function derniere(mots: MotReseau[]): MotReseau | null {
  return mots.reduce<MotReseau | null>((a, m) => (m.trouveLe && (!a?.trouveLe || m.trouveLe > a.trouveLe) ? m : a), null)
}

// ------------------------------------------------------------------ disposition

/** Une rangée par brique : la brique, sa barre de famille, et toute la rangée comme cible tactile. */
export const PAS = 44
export const MARGE = 4
export const OMBRE = 2
export const PAD_X = 8
/** Neutre entre une brique et le départ de ses courbes. */
export const ECART = 4
export const BARRE = 5
export const JEU_BARRE = 3
/** Vue d'ensemble : au-delà de cette hauteur, une courbe devient une antenne chiffrée. */
export const SEUIL_LOIN = 640
/** Vue d'ensemble : départ horizontal des courbes, où se logent les comptes d'antenne. */
export const ABORD = 40
export const RIVIERE_MIN = 90
export const POLICE_TITRE = 12
const INTERLIGNE_TITRE = 16

/** Mesure d'un texte en pixels, pour une taille et une famille (`serif`, `mono`). */
export type Mesurer = (texte: string, taille: number, famille: 'serif' | 'mono', gras?: boolean) => number

/** Estimation sans canvas (tests, rendu hors navigateur) : un peu large, jamais trop étroite. */
export const estimer: Mesurer = (texte, taille, famille) => Array.from(texte).length * taille * (famille === 'mono' ? 0.62 : 0.6)

export interface Place {
  cote: Cote
  brique: string
  bande: number
  /** Centre de la rangée. */
  y: number
  /** Centre de la brique dans sa rangée. */
  yb: number
  x: number
  largeur: number
}

export interface Disposition {
  largeur: number
  hauteur: number
  police: number
  /** Hauteur d'une brique. */
  h: number
  compteurs: boolean
  /** Largeur réservée aux comptes « 2/5 » de chaque rive. */
  k: number
  /** Largeur d'une rive : la plus longue brique du réseau, jamais celle de la vue. */
  col: number
  /** Bord droit des briques de gauche, bord gauche de celles de droite. */
  xG: number
  xD: number
  abord: number
  tous: boolean
  places: Map<string, Place>
  bandes: { numero: number; lignes: string[]; y0: number; haut: number; bas: number }[]
}

/**
 * Disposition en deux rives : une bande par fascicule, les briques par ordre
 * alphabétique, une rangée de 44 px chacune. La largeur des rives dépend de tout le
 * réseau (pas de la vue) : une brique nouvelle ne déplace rien en largeur, et ne
 * déplace en hauteur que les briques qui la suivent dans l'alphabet.
 */
export function disposer(reseau: Reseau, bandes: Bande[], largeurCadre: number, tous: boolean, mesurer: Mesurer = estimer): Disposition {
  const police = largeurCadre < 480 ? 14 : 15
  const h = police + 10
  const compteurs = largeurCadre >= 560
  const k = compteurs ? Math.ceil(mesurer('00/00', 12, 'mono')) + 10 : 0
  const col = Math.max(60, ...[...reseau.briques.values()].map((b) => Math.ceil(mesurer(b.libelle, police, 'serif', true)) + 2 * PAD_X))
  const abord = tous ? ABORD : ECART
  const riviere = Math.max(RIVIERE_MIN, 2 * abord + 50)
  const largeur = Math.max(largeurCadre, 2 * (MARGE + k + col) + OMBRE + riviere)
  const xG = MARGE + k + col
  const xD = largeur - MARGE - OMBRE - k - col
  const rive = k + col
  const nom = (n: number) => reseau.fascicules.find((f) => f.numero === n)?.nom ?? `Fascicule ${n}`
  const places = new Map<string, Place>()
  const plan: Disposition['bandes'] = []
  // Centre vertical de la brique dans sa rangée : brique, ombre, 3 px de neutre, barre.
  const yBrique = (y: number) => y - PAS / 2 + (PAS - (h + OMBRE + JEU_BARRE + BARRE)) / 2 + h / 2
  let y = 0
  for (const bande of bandes) {
    // Titre « 3 · ROUTES DES MOTS », replié sur la largeur d'une rive : il ne déborde jamais dans la rivière.
    const lignes: string[] = []
    for (const morceau of [`${bande.numero} ·`, ...nom(bande.numero).toUpperCase().split(' ')]) {
      const dernier = lignes.at(-1)
      const essai = dernier === undefined ? morceau : `${dernier} ${morceau}`
      if (dernier !== undefined && mesurer(essai, POLICE_TITRE, 'mono', true) > rive) lignes.push(morceau)
      else if (dernier !== undefined) lignes[lignes.length - 1] = essai
      else lignes.push(morceau)
    }
    const haut = y + 10 + lignes.length * INTERLIGNE_TITRE
    for (const cote of ['g', 'd'] as const) {
      bande[cote].forEach((b, i) => {
        const yr = haut + (i + 0.5) * PAS
        const largeurBrique = Math.ceil(mesurer(reseau.briques.get(b)?.libelle ?? b, police, 'serif', true)) + 2 * PAD_X
        places.set(cle(cote, b), { cote, brique: b, bande: bande.numero, y: yr, yb: yBrique(yr), x: cote === 'g' ? xG - largeurBrique : xD, largeur: largeurBrique })
      })
    }
    const bas = haut + Math.max(bande.g.length, bande.d.length) * PAS
    plan.push({ numero: bande.numero, lignes, y0: y, haut, bas })
    y = bas
  }
  return { largeur, hauteur: y + 8, police, h, compteurs, k, col, xG, xD, abord, tous, places, bandes: plan }
}

export interface Lien {
  mot: MotReseau
  d: string
  dernier: boolean
  famille: boolean
}

export interface Antenne {
  cle: string
  cote: Cote
  /** -1 : vers le haut, 1 : vers le bas. */
  sens: -1 | 1
  nombre: number
  d: string
  x: number
  y: number
}

/**
 * Courbes et antennes. Une courbe part horizontalement de sa brique, traverse la
 * rivière et repart horizontalement : elle ne passe jamais sous une brique ni sous
 * un texte. Dans la vue d'ensemble, une courbe de plus de 640 px de haut devient
 * deux antennes chiffrées, sauf pour la famille suivie et la dernière découverte.
 */
export function tracer(L: Disposition, mots: MotReseau[], dernier: MotReseau | null, focus: string | null): { liens: Lien[]; antennes: Antenne[] } {
  const f = (v: number) => v.toFixed(1)
  const enFamille = (m: MotReseau) => focus !== null && (cle('g', m.gauche) === focus || cle('d', m.droite) === focus)
  const pg = (m: MotReseau) => L.places.get(cle('g', m.gauche))
  const pd = (m: MotReseau) => L.places.get(cle('d', m.droite))
  const visibles = mots.filter((m) => pg(m) && pd(m))
  const lointain = (m: MotReseau) => L.tous && !enFamille(m) && m !== dernier && Math.abs(pg(m)!.yb - pd(m)!.yb) > SEUIL_LOIN
  const traces = visibles.filter((m) => !lointain(m))
  const comptes = new Map<string, number>()
  for (const m of visibles.filter(lointain)) {
    const sens = Math.sign(pd(m)!.yb - pg(m)!.yb)
    for (const [k, s] of [[cle('g', m.gauche), sens], [cle('d', m.droite), -sens]] as const) comptes.set(`${k}|${s}`, (comptes.get(`${k}|${s}`) ?? 0) + 1)
  }
  // Ports : les départs d'une brique s'étalent sur 10 px, dans l'ordre de leurs partenaires ; les antennes aux extrémités.
  const ports = new Map<string, number>()
  for (const [k, p] of L.places) {
    const departs = traces
      .filter((m) => cle('g', m.gauche) === k || cle('d', m.droite) === k)
      .map((m) => ({ id: m.id, y: (p.cote === 'g' ? pd(m)! : pg(m)!).yb }))
    if (comptes.has(`${k}|-1`)) departs.push({ id: 'haut', y: -Infinity })
    if (comptes.has(`${k}|1`)) departs.push({ id: 'bas', y: Infinity })
    departs.sort((a, b) => a.y - b.y || (a.id > b.id ? 1 : -1))
    departs.forEach((o, i) => ports.set(`${k}|${o.id}`, p.yb + (departs.length === 1 ? 0 : (i / (departs.length - 1) - 0.5) * 10)))
  }
  const gauche = L.xG + OMBRE + ECART
  const droite = L.xD - ECART
  const liens = traces
    .map((m) => {
      const y1 = ports.get(`${cle('g', m.gauche)}|${m.id}`)!
      const y2 = ports.get(`${cle('d', m.droite)}|${m.id}`)!
      const a = L.xG + OMBRE + L.abord
      const b = L.xD - L.abord
      const c = (b - a) / 2
      return { mot: m, d: `M${f(gauche)} ${f(y1)}H${f(a)}C${f(a + c)} ${f(y1)} ${f(b - c)} ${f(y2)} ${f(b)} ${f(y2)}H${f(droite)}`, dernier: m === dernier, famille: enFamille(m) }
    })
    // La dernière découverte puis la famille suivie, par-dessus les autres.
    .sort((a, b) => Number(a.dernier) - Number(b.dernier) || Number(a.famille) - Number(b.famille))
  const antennes: Antenne[] = []
  for (const [k, nombre] of comptes) {
    const i = k.lastIndexOf('|')
    const noeud = k.slice(0, i)
    const sens = Number(k.slice(i + 1)) as -1 | 1
    const p = L.places.get(noeud)!
    const g = p.cote === 'g'
    const x0 = g ? gauche : droite
    const s1 = g ? 1 : -1
    const y0 = ports.get(`${noeud}|${sens < 0 ? 'haut' : 'bas'}`)!
    // Le compte se loge entre deux rangées de ports : « bas » juste sous la sienne, « haut » juste au-dessus.
    const yt = p.yb + sens * 13
    antennes.push({ cle: noeud, cote: p.cote, sens, nombre, d: `M${f(x0)} ${f(y0)}C${f(x0 + s1 * 6)} ${f(y0)} ${f(x0 + s1 * 6)} ${f(yt)} ${f(x0 + s1 * 10)} ${f(yt)}`, x: x0 + s1 * 12, y: yt })
  }
  return { liens, antennes }
}

import { describe, expect, it } from 'vitest'

import type { EntreeCodex } from './codex'
import { PAS, SEUIL_LOIN, cle, construireReseau, derniere, disposer, famille, portee, tracer } from './constellation'
import type { BriqueJeu, CatalogueJeu } from './jeu'

// Catalogue fictif : deux fascicules, cinq préfixes, trois suffixes, une légendaire.
const brique = (id: string, nature: BriqueJeu['nature'], libelle: string, rarete: BriqueJeu['rarete'] = 'commune'): BriqueJeu => ({
  id,
  uniteId: `u_${id}`,
  nature,
  forme: libelle.replace(/-/g, ''),
  libelle,
  rarete,
  glose: null,
  langue: null,
  origine: null,
})
const BRIQUES = [
  brique('geo', 'prefixe', 'géo-'),
  brique('bio', 'prefixe', 'bio-'),
  brique('zoo', 'prefixe', 'zoo-'),
  brique('hydro', 'prefixe', 'hydro-'),
  brique('astro', 'prefixe', 'astro-'),
  brique('baro', 'prefixe', 'baro-', 'legendaire'),
  brique('logie', 'suffixe', '-logie'),
  brique('graphe', 'suffixe', '-graphe'),
  brique('metre', 'suffixe', '-mètre'),
]
// mot, fascicule, gauche, droite
const MOTS: [string, number, string, string][] = [
  ['geologie', 1, 'geo', 'logie'],
  ['biologie', 1, 'bio', 'logie'],
  ['zoologie', 1, 'zoo', 'logie'],
  ['geographe', 1, 'geo', 'graphe'],
  ['hydrologie', 2, 'hydro', 'logie'],
  ['hydrometre', 2, 'hydro', 'metre'],
  ['astrologie', 2, 'astro', 'logie'],
  ['barometre', 2, 'baro', 'metre'],
]

function jeu(): CatalogueJeu {
  return {
    fascicules: [1, 2, 3].map((numero) => ({ numero, manifeste: { id: `fsc_${numero}`, nom: ['Rosette', 'Argile', 'Aleph'][numero - 1] } })),
    briques: new Map(BRIQUES.map((b) => [b.id, b])),
    recettes: MOTS.map(([m, , g, d]) => ({ id: `r_${m}`, motId: m, emplacements: [[g], [d]] })),
  } as unknown as CatalogueJeu
}

function entrees(trouves: string[], dates: Record<string, string> = {}): EntreeCodex[] {
  const mots = MOTS.map(([m, f, g, d]) => ({
    id: m,
    n: 0,
    fascicule: f,
    type: 'mot',
    libelle: m,
    trouvee: trouves.includes(m),
    trouveeLe: dates[m] ?? null,
    legendaire: g === 'baro' || d === 'baro',
  }))
  const briques = BRIQUES.map((b) => ({
    id: b.uniteId,
    n: 0,
    fascicule: 1,
    type: b.nature,
    libelle: b.libelle,
    trouvee: MOTS.some(([m, , g, d]) => trouves.includes(m) && (g === b.id || d === b.id)),
    trouveeLe: null,
    legendaire: b.rarete === 'legendaire',
  }))
  return [...mots, ...briques] as unknown as EntreeCodex[]
}

describe('constellation', () => {
  const tout = ['geologie', 'biologie', 'geographe', 'hydrologie', 'hydrometre', 'barometre']

  it('ne garde ni légendaire, ni fascicule verrouillé ; les totaux ne comptent que le visible', () => {
    const reseau = construireReseau(jeu(), entrees(tout), new Set([1]))
    expect(reseau.mots.map((m) => m.id).sort()).toEqual(['biologie', 'geographe', 'geologie', 'zoologie'])
    expect(reseau.fascicules.map((f) => f.nom)).toEqual(['Rosette'])
    expect([...reseau.briques.keys()]).not.toContain('baro')
    const deux = construireReseau(jeu(), entrees(tout), new Set([1, 2]))
    expect(deux.mots.map((m) => m.id)).not.toContain('barometre')
    // -logie : 3 sur 3 dans Rosette, 4 sur 5 dans les deux fascicules ouverts.
    expect(famille(deux, 'logie', 1)).toMatchObject({ trouves: 2, total: 3 })
    expect(famille(deux, 'logie', 'tous')).toMatchObject({ trouves: 3, total: 5 })
  })

  it('ne montre que les briques des mots trouvés, par ordre alphabétique', () => {
    const reseau = construireReseau(jeu(), entrees(['geologie', 'biologie']), new Set([1, 2]))
    const { bandes, mots } = portee(reseau, 1)
    expect(mots.map((m) => m.id)).toEqual(['geologie', 'biologie'])
    expect(bandes).toEqual([{ numero: 1, g: ['bio', 'geo'], d: ['logie'] }])
    expect(portee(reseau, 2).bandes).toEqual([])
  })

  it('range une brique dans la bande du premier fascicule qui l’emploie, dans la vue d’ensemble', () => {
    const reseau = construireReseau(jeu(), entrees(['hydrologie', 'hydrometre']), new Set([1, 2]))
    expect(portee(reseau, 'tous').bandes).toEqual([
      { numero: 1, g: [], d: ['logie'] },
      { numero: 2, g: ['hydro'], d: ['metre'] },
    ])
  })

  it('dispose sans chevauchement, et une découverte ne déplace que les briques qui suivent dans l’alphabet', () => {
    const avant = construireReseau(jeu(), entrees(['geologie', 'geographe', 'zoologie']), new Set([1]))
    const apres = construireReseau(jeu(), entrees(['geologie', 'geographe', 'zoologie', 'biologie']), new Set([1]))
    const L1 = disposer(avant, portee(avant, 1).bandes, 390, false)
    const L2 = disposer(apres, portee(apres, 1).bandes, 390, false)
    for (const L of [L1, L2]) {
      const places = [...L.places.values()]
      for (const a of places) {
        for (const b of places) {
          if (a === b) continue
          const chevauche = a.x < b.x + b.largeur && b.x < a.x + a.largeur && Math.abs(a.y - b.y) < PAS
          expect(chevauche).toBe(false)
        }
      }
      // Les briques ne débordent jamais dans la rivière.
      for (const p of places) expect(p.cote === 'g' ? p.x + p.largeur <= L.xG : p.x >= L.xD).toBe(true)
    }
    // bio- s'insère avant géo- : géo- descend d'une rangée, zoo- aussi ; les suffixes ne bougent pas.
    expect(L2.places.get(cle('g', 'geo'))!.y - L1.places.get(cle('g', 'geo'))!.y).toBe(PAS)
    expect(L2.places.get(cle('d', 'graphe'))!.y).toBe(L1.places.get(cle('d', 'graphe'))!.y)
    expect(L2.places.get(cle('d', 'logie'))!.y).toBe(L1.places.get(cle('d', 'logie'))!.y)
    // Même largeur de rive : elle dépend de tout le réseau, pas des briques trouvées.
    expect(L2.xG).toBe(L1.xG)
  })

  it('trace des courbes qui restent dans la rivière, la dernière découverte à part', () => {
    const reseau = construireReseau(jeu(), entrees(['geologie', 'biologie'], { geologie: '2026-10-01T08:00:00Z', biologie: '2026-10-02T08:00:00Z' }), new Set([1]))
    const { mots, bandes } = portee(reseau, 1)
    const L = disposer(reseau, bandes, 390, false)
    const dernier = derniere(mots)
    expect(dernier?.id).toBe('biologie')
    const { liens, antennes } = tracer(L, mots, dernier, null)
    expect(antennes).toEqual([])
    expect(liens.at(-1)?.dernier).toBe(true)
    // Abscisses du chemin « Mx y Hx Cx y x y x y Hx » : toutes entre les deux rives.
    const abscisses = (d: string) =>
      [...d.matchAll(/([MHC])([^MHC]+)/g)].flatMap(([, op, args]) => {
        const n = args!.trim().split(/\s+/).map(Number)
        return op === 'H' ? n : n.filter((_, i) => i % 2 === 0)
      })
    for (const l of liens) {
      for (const x of abscisses(l.d)) {
        expect(x).toBeGreaterThan(L.xG)
        expect(x).toBeLessThan(L.xD)
      }
    }
  })

  it('change une courbe trop haute en antennes, dans la vue d’ensemble seulement', () => {
    const reseau = construireReseau(jeu(), entrees(['geologie', 'biologie', 'zoologie', 'geographe', 'astrologie']), new Set([1, 2]))
    const { mots, bandes } = portee(reseau, 'tous')
    const L = disposer(reseau, bandes, 900, true)
    // Écart artificiel : la rangée d'astro- part loin sous -logie.
    L.places.get(cle('g', 'astro'))!.yb += SEUIL_LOIN
    const { liens, antennes } = tracer(L, mots, null, null)
    expect(liens.map((l) => l.mot.id)).not.toContain('astrologie')
    expect(antennes.map((a) => [a.cle, a.sens, a.nombre]).sort()).toEqual([
      [cle('d', 'logie'), 1, 1],
      [cle('g', 'astro'), -1, 1],
    ])
    // Suivie, la famille d'astro- reste tracée en entier.
    expect(tracer(L, mots, null, cle('g', 'astro')).liens.map((l) => l.mot.id)).toContain('astrologie')
  })
})

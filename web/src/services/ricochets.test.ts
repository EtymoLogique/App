import { describe, expect, it } from 'vitest'

import { type DonneesRicochets, type NoeudCoupes, arbreDuMot, feuillesDuMot, juger, jugerCoupes, retour } from './ricochets'

const d: DonneesRicochets = {
  briques: new Map([
    ['brq_1', { sens: 'sns_1', classe: 'sns_1' }],
    ['brq_2', { sens: 'sns_2', classe: 'sns_2' }],
    ['brq_3', { sens: 'sns_3', classe: 'sns_1' }],
  ]),
  mots: new Map([
    ['unt_1', { classe: 'unt_1', coupes: [3] }],
    ['unt_2', { classe: 'unt_1', coupes: [] }],
    ['unt_3', { classe: null, coupes: [] }],
  ]),
  gloses: new Map(),
}

describe('juger', () => {
  it('sens d’une brique : le sien, ou celui d’une brique de même glose', () => {
    expect(juger(d, 'sens_brique', 'brq_1', 'sns_1')).toBe(true)
    expect(juger(d, 'sens_brique', 'brq_1', 'sns_3')).toBe(true)
    expect(juger(d, 'sens_brique', 'brq_1', 'sns_2')).toBe(false)
    expect(juger(d, 'paires', 'brq_2', 'sns_2')).toBe(true)
  })
  it('brique d’un sens et mot d’un sens littéral', () => {
    expect(juger(d, 'brique_sens', 'brq_1', 'brq_3')).toBe(true)
    expect(juger(d, 'brique_sens', 'brq_1', 'brq_2')).toBe(false)
    expect(juger(d, 'mot_sens', 'unt_1', 'unt_2')).toBe(true)
    expect(juger(d, 'mot_sens', 'unt_3', 'unt_1')).toBeNull()
  })
  it('découper : l’ordre et les doublons ne comptent pas', () => {
    expect(juger(d, 'decouper', 'unt_1', [3, 3])).toBe(true)
    expect(juger(d, 'decouper', 'unt_1', [2])).toBe(false)
    expect(juger(d, 'decouper', 'unt_2', [1])).toBeNull()
  })
})

// Mêmes cas que `etymo_domaine::decoupage` (crates/domaine/src/decoupage.rs) : le miroir juge comme le serveur.
describe('jugerCoupes', () => {
  const feuille = (debut: number, fin: number, coupes: number[]): NoeudCoupes => ({ debut, fin, coupes, parties: [] })
  // étymologiste : étymologie · iste, puis étymo · logie.
  const etymologiste: NoeudCoupes = { debut: 0, fin: 13, coupes: [10], parties: [feuille(0, 10, [5])] }

  it('un mot à un niveau', () => {
    const geologie = feuille(0, 8, [3])
    expect(jugerCoupes(geologie, [])).toBe('continue')
    expect(jugerCoupes(geologie, [3])).toBe('termine')
    expect(jugerCoupes(geologie, [3, 3])).toBe('termine')
    expect(jugerCoupes(geologie, [2])).toBe('faux')
    expect(jugerCoupes(geologie, [3, 5])).toBe('faux')
  })
  it('la chaîne se coupe niveau par niveau', () => {
    expect(jugerCoupes(etymologiste, [10])).toBe('continue')
    expect(jugerCoupes(etymologiste, [10, 5])).toBe('termine')
  })
  it('le sous-niveau attend son morceau, l’ordre de l’ensemble posé n’importe pas', () => {
    expect(jugerCoupes(etymologiste, [5])).toBe('faux')
    expect(jugerCoupes(etymologiste, [5, 10])).toBe('termine')
  })
  it('une coupe fausse, même après des justes, arrête la question', () => {
    expect(jugerCoupes(etymologiste, [10, 7])).toBe('faux')
    expect(jugerCoupes(etymologiste, [10, 5, 7])).toBe('faux')
    expect(jugerCoupes(etymologiste, [0])).toBe('faux')
    expect(jugerCoupes(etymologiste, [99])).toBe('faux')
  })
  it('trois parties se coupent dans un ordre libre', () => {
    const mot = feuille(0, 12, [3, 8])
    expect(jugerCoupes(mot, [8])).toBe('continue')
    expect(jugerCoupes(mot, [3])).toBe('continue')
    expect(jugerCoupes(mot, [8, 3])).toBe('termine')
  })
  it('un sous-nœud décalé, partie finale', () => {
    const mot: NoeudCoupes = { debut: 0, fin: 10, coupes: [4], parties: [feuille(4, 10, [7])] }
    expect(jugerCoupes(mot, [7])).toBe('faux')
    expect(jugerCoupes(mot, [4])).toBe('continue')
    expect(jugerCoupes(mot, [4, 7])).toBe('termine')
  })
  it('un mot publié à plat se juge sur son seul niveau', () => {
    const plat = { ...d, mots: new Map([['unt_9', { classe: null, coupes: [5, 3, 5] }]]) }
    const arbre = arbreDuMot(plat, 'unt_9')
    expect(arbre?.coupes).toEqual([3, 5])
    expect(juger(plat, 'decouper', 'unt_9', [3, 5])).toBe(true)
    expect(juger(plat, 'decouper', 'unt_9', [3])).toBeNull()
    expect(juger(plat, 'decouper', 'unt_9', [4])).toBe(false)
  })
  it('juger : vrai à la dernière coupe, nul tant qu’il en reste, faux dès une erreur', () => {
    const chaine = { ...d, mots: new Map([['unt_1', { classe: null, coupes: [10], decoupage: etymologiste }]]) }
    expect(juger(chaine, 'decouper', 'unt_1', [10])).toBeNull()
    expect(juger(chaine, 'decouper', 'unt_1', [10, 5])).toBe(true)
    expect(juger(chaine, 'decouper', 'unt_1', [10, 7])).toBe(false)
  })
})

describe('feuillesDuMot', () => {
  it('sans composition connue, la nature vient de la place du morceau', () => {
    const jeu = { cartes: new Map() } as never
    const arbre: NoeudCoupes = { debut: 0, fin: 13, coupes: [10], parties: [{ debut: 0, fin: 10, coupes: [5] }] }
    expect(feuillesDuMot(jeu, 'unt_1', arbre)).toEqual([
      { debut: 0, fin: 10, nature: 'prefixe' },
      { debut: 10, fin: 13, nature: 'suffixe' },
    ])
  })
})

describe('feuillesDuMot avec les compositions', () => {
  it('descend dans les parties qui se coupent à leur tour et prend la nature de chaque unité', () => {
    const composition = (parties: [string, number, number][]) => ({
      preferee: true,
      parties: parties.map(([unite_id, segment_debut, segment_fin], i) => ({ rang: i + 1, unite_id, segment_debut, segment_fin })),
    })
    const jeu = {
      cartes: new Map<string, unknown>([
        ['unt_mot', { nature: 'mot', compositions: [composition([['unt_logie', 0, 10], ['unt_iste', 10, 13]])] }],
        ['unt_logie', { nature: 'mot', compositions: [composition([['unt_etymo', 0, 5], ['unt_fin', 5, 10]])] }],
        ['unt_etymo', { nature: 'prefixe' }],
        ['unt_fin', { nature: 'suffixe' }],
        ['unt_iste', { nature: 'suffixe' }],
      ]),
    } as never
    const arbre: NoeudCoupes = { debut: 0, fin: 13, coupes: [10], parties: [{ debut: 0, fin: 10, coupes: [5] }] }
    expect(feuillesDuMot(jeu, 'unt_mot', arbre)).toEqual([
      { debut: 0, fin: 5, nature: 'prefixe' },
      { debut: 5, fin: 10, nature: 'suffixe' },
      { debut: 10, fin: 13, nature: 'suffixe' },
    ])
  })
})

describe('retour', () => {
  const carte = (jours: number, maitrisee = false) => ({
    niveau: 1,
    maitrisee,
    bonnes_niveau_3: 0,
    prochaine_revision: new Date(Date.UTC(2026, 9, 3 + jours)).toISOString().slice(0, 10),
  })
  const auj = new Date(Date.UTC(2026, 9, 3, 12))
  it('dit le délai', () => {
    expect(retour(carte(1), auj)).toBe('Demain')
    expect(retour(carte(3), auj)).toBe('Dans 3 jours')
    expect(retour(carte(7, true), auj)).toBe('Maîtrisée · dans 7 jours')
  })
})

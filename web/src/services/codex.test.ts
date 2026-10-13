import { describe, expect, it } from 'vitest'

import { GEO, LOGIE, MOT, RECETTE, cartes, etat, ex, jeu, manifeste } from '../test/fixtures'
import { cabinet, completude, construireCodex, familles, recentes, rechercher, savoirPlus } from './codex'

function catalogue() {
  const c = jeu()
  c.fascicules[0]!.manifeste = { ...manifeste, cartes: cartes.map((x) => ({ id: x.id, role: x.brique ? 'ingredient' : 'resultat', carte: 'r/x' })) }
  return c
}

describe('codex', () => {
  it('montre les briques connues, et le mot en silhouette tant qu’il n’est pas découvert', () => {
    const entrees = construireCodex(catalogue(), etat())
    const mot = entrees.find((e) => e.id === MOT)
    expect(mot).toMatchObject({ trouvee: false, sens: 'étude de la terre', resultat: true })
    expect(entrees.filter((e) => e.trouvee).map((e) => e.libelle)).toEqual(['géo-', '-logie'])
    expect(completude(entrees)).toEqual({ trouvees: 2, total: 3, legendaires: 0 })
    expect(entrees.find((e) => e.id === MOT)?.rarete).toBe('commune')
    expect(entrees.find((e) => e.libelle === 'géo-')?.rarete).toBe('commune')
  })

  it('donne la rareté la plus basse à un mot qui ne naît d’aucune fusion', () => {
    const c = catalogue()
    c.recettes = []
    expect(construireCodex(c, etat()).find((e) => e.id === MOT)?.rarete).toBe('commune')
  })

  it('ne trahit jamais une légendaire inconnue ni le mot qui en dépend', () => {
    const c = catalogue()
    const logie = c.briques.get(LOGIE)!
    c.briques.set(LOGIE, { ...logie, rarete: 'legendaire' })
    const carte = c.cartes.get(logie.uniteId)!
    c.cartes.set(logie.uniteId, { ...carte, brique: { ...carte.brique!, rarete: 'legendaire' } })
    const entrees = construireCodex(c, etat({ reserve: [ex(GEO, 2)] }))
    expect(entrees.map((e) => e.id)).toEqual(['unt_0000ge00'])
  })

  it('montre en silhouette le mot qui exige une légendaire dès qu’elle est trouvée', () => {
    const c = catalogue()
    const logie = c.briques.get(LOGIE)!
    c.briques.set(LOGIE, { ...logie, rarete: 'legendaire' })
    const carte = c.cartes.get(logie.uniteId)!
    c.cartes.set(logie.uniteId, { ...carte, brique: { ...carte.brique!, rarete: 'legendaire' } })
    const mot = construireCodex(c, etat({ reserve: [ex(GEO, 1), ex(LOGIE, 1)] })).find((e) => e.id === MOT)
    expect(mot).toMatchObject({ trouvee: false, legendaire: false })
  })

  it('ne trouve que des cartes découvertes, par forme ou par sens', () => {
    const entrees = construireCodex(catalogue(), etat())
    // Le mot inconnu a « terre » dans sa piste : il reste introuvable.
    expect(rechercher(entrees, 'terre')).toEqual([{ titre: 'Briques', entrees: [expect.objectContaining({ libelle: 'géo-' })] }])
    expect(rechercher(entrees, 'GEO')[0]?.entrees.map((e) => e.libelle)).toEqual(['géo-'])
    expect(rechercher(entrees, 'géologie')).toEqual([])
    expect(rechercher(entrees, '  ')).toEqual([])
    const apres = construireCodex(catalogue(), etat({ decouvertes: [decouverte] }))
    expect(rechercher(apres, 'terre').map((g) => g.titre)).toEqual(['Briques', 'Mots'])
  })

  it('donne leur niveau de ricochets aux cartes trouvées, par mot ou par brique', () => {
    const ricochets = [
      { unite_id: GEO, niveau: 2, maitrisee: false, a_revoir: false },
      { unite_id: MOT, niveau: 3, maitrisee: true, a_revoir: false },
    ]
    const entrees = construireCodex(catalogue(), etat({ decouvertes: [decouverte], ricochets }))
    expect(entrees.map((e) => [e.libelle, e.maitrise])).toEqual([
      ['géo-', { niveau: 2, maitrisee: false }],
      ['-logie', { niveau: 0, maitrisee: false }],
      ['géologie', { niveau: 3, maitrisee: true }],
    ])
    expect(construireCodex(catalogue(), etat()).find((e) => e.id === MOT)?.maitrise).toBeNull()
  })

  it('range les découvertes récentes de la plus récente à la plus ancienne', () => {
    const entrees = construireCodex(catalogue(), etat({ decouvertes: [decouverte] }))
    // Obtenues au même instant, les briques se départagent par leur numéro.
    expect(recentes(entrees).map((e) => e.libelle)).toEqual(['géologie', '-logie', 'géo-'])
  })

  it('déduit la famille d’une brique trouvée des mots qu’elle forme', () => {
    const avant = familles(construireCodex(catalogue(), etat()), catalogue())
    expect(avant.map((f) => [f.brique.libelle, f.trouves, f.mots.length])).toEqual([
      ['géo-', 0, 1],
      ['-logie', 0, 1],
    ])
    const apres = familles(construireCodex(catalogue(), etat({ reserve: [ex(GEO, 1)], decouvertes: [decouverte] })), catalogue())
    expect(apres.map((f) => [f.brique.libelle, f.trouves])).toEqual([['géo-', 1]])
  })

  it('explique l’histoire d’une carte trouvée, sans rien d’une carte à trouver', () => {
    const c = catalogue()
    const grec = 'lng_00000g00'
    c.langues.set(grec, 'grec ancien')
    const geo = c.cartes.get('unt_0000ge00')!
    c.cartes.set(geo.id, {
      ...geo,
      relations: [
        {
          id: 'rel_0000000a',
          type_code: 'forme_de_composition',
          etymon: {
            id: 'unt_0000g000',
            langue_id: grec,
            forme: { id: 'frm_0000g000', texte: 'γῆ', role: 'canonique', systeme_ecriture_id: 'ecr_0000000b', translitterations: [{ convention_id: 'cnv_0000000a', texte: 'gê' }] },
            sens: [{ id: 'sns_0000g000', rang: 1, libelles: { fr: { glose: 'terre' } } }],
          },
        },
      ],
    })
    const mot = c.cartes.get(MOT)!
    c.cartes.set(MOT, {
      ...mot,
      fait: { confiance: 'etablie' },
      compositions: mot.compositions!.map((cmp) => ({
        ...cmp,
        fait: { confiance: 'probable', sources: [{ source_id: 'src_0000000a' }] },
        transformations: [{ id: 'trf_0000000a', type_code: 'elision', ordre: 1, rang_partie: 1, libelles: { fr: { texte: 'Une voyelle tombe.' } } }],
      })),
      sources: { src_0000000a: { id: 'src_0000000a', type: 'dictionnaire', role: 'reference', reference: 'TLFi', url: 'javascript:alert(1)' } },
    })

    const inconnue = construireCodex(c, etat()).find((e) => e.id === MOT)!
    expect(savoirPlus(inconnue, c)).toBeNull()

    const trouvee = construireCodex(c, etat({ decouvertes: [decouverte] })).find((e) => e.id === MOT)!
    expect(savoirPlus(trouvee, c)).toEqual({
      chemin: [
        { id: grec, nom: 'Grec ancien' },
        { id: 'lng_00000f00', nom: 'Français' },
      ],
      relations: [
        {
          de: { id: 'unt_0000ge00', libelle: 'géo-', nature: 'prefixe' },
          type: 'forme de composition',
          texte: 'γῆ',
          translitteration: 'gê',
          glose: 'terre',
          langue: 'Grec ancien',
        },
      ],
      transformations: [{ type: 'élision', texte: 'Une voyelle tombe.', partie: 'géo-' }],
      // La composition affichée fait foi, avant le socle de l'unité.
      confiance: 'probable',
      // Une adresse qui n'est pas en https n'est jamais un lien.
      sources: [{ id: 'src_0000000a', reference: 'TLFi', detail: 'Référence · dictionnaire', url: null }],
    })

    // Le cabinet : sans mot trouvé, pas de voyage ; ensuite, la filiation du mot.
    expect(cabinet(construireCodex(c, etat()), c)).toEqual({ mots: 0, langues: 0, legendaires: 0, voyage: null })
    const apres = cabinet(construireCodex(c, etat({ decouvertes: [decouverte] })), c)
    expect(apres).toMatchObject({ mots: 1, legendaires: 0, voyage: { mot: { id: MOT }, langues: ['Grec ancien', 'Français'] } })
    expect(Object.keys(apres)).not.toContain('total')
  })
})

const decouverte = { mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }

describe('codex d’un fascicule verrouillé (ADR 0068)', () => {
  it('ne montre que les cartes trouvées, sans silhouette', () => {
    const c = catalogue()
    const deblocage = { fascicules_debloques: [{ fascicule_id: 'fsc_autre', debloque_le: '2026-10-12T00:00:00Z' }] }
    const entrees = construireCodex(c, etat({ ...deblocage, reserve: [ex(GEO, 2)] }))
    expect(entrees.every((e) => e.trouvee)).toBe(true)
    expect(entrees.map((e) => e.libelle)).toContain('géo-')
    expect(entrees.find((e) => e.id === MOT)).toBeUndefined()
  })
})

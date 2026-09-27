// Catalogue fictif pour les tests : géo + logie → géologie. Aucune donnée réelle.

import { vi } from 'vitest'

import type { Carte, Etat, Manifeste, Recette } from '../contrat'
import { LecteurCatalogue } from '../services/catalogue'
import { type CatalogueJeu, libelle } from '../services/jeu'

export const GEO = 'brq_0000ge00'
export const LOGIE = 'brq_000109e0'
export const MOT = 'unt_0000m070'
export const RECETTE = 'rct_0000000a'
const FR = 'lng_00000f00'
const LATN = 'ecr_0000000a'

function carteBrique(id: string, brique: string, nature: Carte['nature'], texte: string, glose: string): Carte {
  return {
    id,
    nature,
    langue_id: FR,
    formes: [{ id: `frm_${id.slice(4)}`, texte, role: 'canonique', systeme_ecriture_id: LATN }],
    sens: [{ id: `sns_${id.slice(4)}`, rang: 1, libelles: { fr: { glose } } }],
    brique: { id: brique, forme_affichee_id: `frm_${id.slice(4)}`, sens_affiche_id: `sns_${id.slice(4)}`, rarete: 'commune' },
  }
}

export const cartes: Carte[] = [
  carteBrique('unt_0000ge00', GEO, 'prefixe', 'géo', 'terre'),
  carteBrique('unt_000109e0', LOGIE, 'suffixe', 'logie', 'étude'),
  {
    id: MOT,
    nature: 'mot',
    langue_id: FR,
    formes: [{ id: 'frm_0000m070', texte: 'géologie', role: 'canonique', systeme_ecriture_id: LATN }],
    sens: [{ id: 'sns_0000m070', rang: 1, libelles: { fr: { definition: 'Science de la Terre.' } } }],
    compositions: [
      {
        id: 'cmp_0000000a',
        preferee: true,
        parties: [
          { rang: 1, unite_id: 'unt_0000ge00', forme_id: 'frm_0000ge00', sens_id: 'sns_0000ge00' },
          { rang: 2, unite_id: 'unt_000109e0', forme_id: 'frm_000109e0', sens_id: 'sns_000109e0' },
        ],
        libelles: { fr: { explication_courte: 'Terre et étude.', sens_litteral: 'étude de la terre' } },
      },
    ],
  },
]

export const manifeste: Manifeste = {
  format: 1,
  id: 'fsc_00000000',
  numero: 0,
  parution: '2026-10-01T08:00:00+02:00',
  test: true,
  jaquette: null,
  exclusions: null,
  cartes: [],
  langues: [],
  recettes: [],
  compteurs: { mots: 1 },
  pli: {},
  jalons: [],
  graines: [],
}

export function jeu(): CatalogueJeu {
  const briques = new Map(
    cartes
      .filter((c) => c.brique)
      .map((c) => [
        c.brique?.id as string,
        {
          id: c.brique?.id as string,
          uniteId: c.id,
          nature: c.nature,
          forme: c.formes[0]?.texte ?? '',
          libelle: libelle(c.nature, c.formes[0]?.texte ?? ''),
          rarete: 'commune' as const,
          glose: c.sens[0]?.libelles.fr?.glose ?? null,
          langue: 'français',
          origine: null,
        },
      ]),
  )
  return {
    version: 'v1',
    fascicules: [{ numero: 0, parution: manifeste.parution, manifeste }],
    cartes: new Map(cartes.map((c) => [c.id, c])),
    briques,
    recettes: [{ id: RECETTE, motId: MOT, emplacements: [[GEO], [LOGIE]] }],
    exclusions: [],
    langues: new Map([[FR, 'français']]),
  }
}

export function etat(partiel: Partial<Etat> = {}): Etat {
  return {
    version_etat: 1,
    version_catalogue: 'v1',
    reserve: [
      { brique_id: GEO, exemplaires: 2 },
      { brique_id: LOGIE, exemplaires: 1 },
    ],
    decouvertes: [],
    ...partiel,
  }
}

/** Chemin haché fictif ; le lecteur simulé ne vérifie pas les empreintes. */
function chemin(dossier: 'f' | 'r', n: number): string {
  return `${dossier}/${n.toString(16).padStart(64, '0')}.json`
}

/** Lecteur du catalogue simulé : le même contenu que `jeu()`, servi fichier par fichier. */
export function lecteurFictif(): LecteurCatalogue {
  const fichiers = new Map<string, unknown>()
  const recette: Recette = {
    id: RECETTE,
    composition_id: 'cmp_0000000a',
    resultat_id: MOT,
    emplacements: [
      { rang: 2, briques_acceptees: [LOGIE] },
      { rang: 1, briques_acceptees: [GEO] },
    ],
  }
  fichiers.set(chemin('r', 1), recette)
  cartes.forEach((c, i) => fichiers.set(chemin('r', 10 + i), c))
  const complet: Manifeste = {
    ...manifeste,
    cartes: cartes.map((c, i) => ({ id: c.id, role: c.brique ? 'ingredient' : 'resultat', carte: chemin('r', 10 + i) })),
    recettes: [{ id: RECETTE, chemin: chemin('r', 1) }],
  }
  const lecteur = new LecteurCatalogue('https://catalogue.exemple.test/public')
  vi.spyOn(lecteur, 'index').mockResolvedValue({
    format: 1,
    version: 'v1',
    referentiels: { langues: [{ id: FR, libelles: { fr: { nom: 'français' } } }] },
    fascicules: [{ numero: 0, parution: manifeste.parution, manifeste: chemin('f', 0) }],
  })
  vi.spyOn(lecteur, 'manifeste').mockResolvedValue(complet)
  vi.spyOn(lecteur, 'fichierHache').mockImplementation((c) =>
    Promise.resolve(new TextEncoder().encode(JSON.stringify(fichiers.get(c))).buffer as ArrayBuffer),
  )
  return lecteur
}

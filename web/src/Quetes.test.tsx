import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { Calendrier } from './contrat'
import { ClientApi } from './services/api'
import { effacerPartie } from './services/local'
import { GEO, MOT, RECETTE, etat, lecteurFictif } from './test/fixtures'

const JALON = 'jal_0000000a'
const decouvertes = [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }]
const atteint = etat({ decouvertes, jalons_atteints: [JALON], jalons_recuperes: [] })

/** Lecteur fictif dont le fascicule déclare un jalon à 1 découverte : géo- et 2 sabliers. */
function lecteurAvecJalon() {
  const lecteur = lecteurFictif()
  const manifeste = vi.mocked(lecteur.manifeste)
  const complet = manifeste.getMockImplementation()
  manifeste.mockImplementation(async (...args) => ({
    ...(await complet!(...args)),
    jalons: [{ id: JALON, decouvertes: 1, pli: [GEO], sabliers: 2 }],
  }))
  return lecteur
}

const QUETE = 'qlc_0000000a'
const PALIER = 'pal_0000000a'
const palierAtteint = etat({ decouvertes, progression_quetes: [{ quete_id: QUETE, progression: 1 }], paliers_recuperes: [] })

/** Lecteur fictif dont l'index déclare une quête de langue : un palier à 1 forme, 5 gouttes d'encre et 1 sablier. */
function lecteurAvecQuete() {
  const lecteur = lecteurFictif()
  const index = vi.mocked(lecteur.index)
  const complet = index.getMockImplementation()!
  index.mockImplementation(async () => ({
    ...(await complet())!,
    quetes: [
      {
        id: QUETE,
        sorte: 'langue' as const,
        langue_id: 'lng_0000000a',
        libelles: { fr: { titre: 'Grec ancien', consigne: 'Trouvez des formes de grec ancien.' } },
        paliers: [{ id: PALIER, seuil: 1, encre: 5, sabliers: 1 }],
      },
    ],
  }) as Calendrier)
  return lecteur
}

function client() {
  const api = new ClientApi('https://api.exemple.test')
  vi.spyOn(api, 'etat').mockResolvedValue(atteint)
  vi.spyOn(api, 'sante').mockResolvedValue({ statut: 'ok', version_catalogue: 'v1', version_api: '0', revision_api: '', reinitialisation: false })
  const jalon = vi.spyOn(api, 'jalon').mockResolvedValue({
    etat: { ...atteint, version_etat: 2, jalons_recuperes: [JALON], sabliers: { detenus: 2, prix_gouttes: 10 } },
  })
  return { api, jalon }
}

describe('quêtes', () => {
  beforeEach(async () => {
    await effacerPartie()
    history.replaceState(null, '', '/#/quetes')
  })

  it('signale la récompense qui attend et la récupère au clic', async () => {
    const { api, jalon } = client()
    render(<App api={api} catalogue={lecteurAvecJalon()} />)
    const navigation = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(await within(navigation).findAllByLabelText('1 récompense à récupérer')).not.toHaveLength(0)
    // Une récompense attend : l'onglet des fascicules s'ouvre d'office.
    expect(await screen.findByRole('button', { name: /^Fascicules/, pressed: true })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Récupérer' }))
    expect(await screen.findByText(/^Récompense ajoutée : géo- et 2.sabliers\.$/)).toBeInTheDocument()
    expect(jalon).toHaveBeenCalledWith(expect.objectContaining({ jalon_id: JALON, version_etat: 1, version_catalogue: 'v1' }))
    expect(screen.getByText('✓ Récupérée')).toBeInTheDocument()
    // L'onglet reste celui des fascicules, même sans récompense qui attende.
    expect(screen.getByRole('button', { name: /^Fascicules/, pressed: true })).toBeInTheDocument()
    expect(within(navigation).queryAllByLabelText(/récompense.* à récupérer/)).toHaveLength(0)
  })

  it('liste les quêtes du jour tirées par le serveur', async () => {
    history.replaceState(null, '', '/#/quetes/journalieres')
    const { api } = client()
    vi.spyOn(api, 'etat').mockResolvedValue({
      ...atteint,
      quetes_du_jour: [
        { rang: 0, sorte: 'table', code: 'table_sens', mot_id: MOT, cible: 1, progres: 0, faite: false },
        { rang: 1, sorte: 'memoire', code: 'memoire_sans_faute', cible: 5, progres: 5, faite: true },
        { rang: 2, sorte: 'adresse', code: 'adresse_paires', cible: 4, progres: 2, faite: false },
      ],
    })
    render(<App api={api} catalogue={lecteurAvecJalon()} />)
    expect(await screen.findByText('Cinq ricochets sans faute.')).toBeInTheDocument()
    expect(screen.getByText('✓ Faite')).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aller à la table' })).toBeInTheDocument()
    expect(screen.queryByText('Bientôt disponibles')).not.toBeInTheDocument()
  })

  it('récupère la récompense d’une quête du jour faite, même celle de la veille', async () => {
    history.replaceState(null, '', '/#/quetes/journalieres')
    const { api } = client()
    const recompense = { gouttes: 0, sabliers: 1, plis: 0 }
    const veille = { rang: 1, sorte: 'memoire' as const, code: 'memoire_sans_faute' as const, cible: 5, progres: 5, faite: true, jour: '2026-10-10', recuperee: false, recompense }
    vi.spyOn(api, 'etat').mockResolvedValue({ ...atteint, quetes_du_jour: [veille] })
    const prise = vi.spyOn(api, 'queteDuJour').mockResolvedValue({
      etat: { ...atteint, version_etat: 2, quetes_du_jour: [{ ...veille, recuperee: true }] },
    })
    render(<App api={api} catalogue={lecteurAvecJalon()} />)
    expect(await screen.findByText('1 sablier')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Récupérer' }))
    expect(await screen.findByText(/Récompense ajoutée/)).toBeInTheDocument()
    expect(prise).toHaveBeenCalledWith(expect.objectContaining({ jour: '2026-10-10', rang: 1, version_etat: 1 }))
    expect(screen.getByText('✓ Récupérée')).toBeInTheDocument()
  })

  it('montre la carte de lecteur et récupère la carte pleine', async () => {
    history.replaceState(null, '', '/#/quetes/journalieres')
    const { api } = client()
    const quetes = [{ rang: 1, sorte: 'memoire' as const, code: 'memoire_sans_faute' as const, cible: 5, progres: 5, faite: true }]
    const carte = { taille: 7, a_recuperer: 1, remplies: 1, recompense: { gouttes: 20, sabliers: 1, plis_de_lecteur: 1 } }
    const jours = ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-07', '2026-10-08', '2026-10-09']
    vi.spyOn(api, 'etat').mockResolvedValue({ ...atteint, quetes_du_jour: quetes, carte_de_lecteur: { ...carte, tampons: jours } })
    const recuperee = vi.spyOn(api, 'carteDeLecteur').mockResolvedValue({
      ouverture: { fascicule_id: 'fsc_00000000', brique_id: GEO, resultat: 'nouvelle', regle: 'tirage', encre: 0, ouvert_le: '2026-10-11T10:00:00Z' },
      etat: { ...atteint, version_etat: 2, quetes_du_jour: quetes, carte_de_lecteur: { ...carte, tampons: [], a_recuperer: 0 } },
    })
    render(<App api={api} catalogue={lecteurAvecJalon()} />)
    expect(await screen.findByText('7 / 7')).toBeInTheDocument()
    expect(screen.getByText('4 oct.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Récupérer' }))
    expect(await screen.findByText(/Carte récupérée/)).toBeInTheDocument()
    expect(recuperee).toHaveBeenCalledWith(expect.objectContaining({ version_etat: 1, version_catalogue: 'v1' }))
    expect(await screen.findByText('0 / 7')).toBeInTheDocument()
  })

  it('propose le cadeau de bienvenue et le récupère une fois', async () => {
    history.replaceState(null, '', '/#/quetes/journalieres')
    const { api } = client()
    const cadeau = { plis: [GEO, GEO], sabliers: 12, encre: 40 }
    vi.spyOn(api, 'etat').mockResolvedValue({ ...atteint, cadeau_de_bienvenue: { ...cadeau, recupere: false } })
    const recupere = vi.spyOn(api, 'cadeau').mockResolvedValue({
      etat: { ...atteint, version_etat: 2, cadeau_de_bienvenue: { ...cadeau, recupere: true } },
    })
    render(<App api={api} catalogue={lecteurAvecJalon()} />)
    expect(await screen.findByRole('region', { name: 'Cadeau de bienvenue' })).toBeInTheDocument()
    expect(screen.getByText('12 sabliers')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Récupérer' }))
    expect(await screen.findByText('Cadeau de bienvenue récupéré.')).toBeInTheDocument()
    expect(recupere).toHaveBeenCalledWith(expect.objectContaining({ version_etat: 1, version_catalogue: 'v1' }))
    expect(screen.queryByRole('button', { name: 'Récupérer' })).not.toBeInTheDocument()
  })

  it('liste les quêtes de la première semaine et récupère une récompense sans pli', async () => {
    history.replaceState(null, '', '/#/quetes/ponctuelles')
    const { api } = client()
    const recompense = { plis_offerts: 0, plis_de_lecteur: 0, sabliers: 3, gouttes: 0 }
    const initiales = (faite: boolean, recuperee: boolean) => [
      { code: 'trois_mots' as const, cible: 3, progres: 1, faite: false, recuperee: false, recompense: { ...recompense, sabliers: 0, plis_offerts: 2 } },
      { code: 'premiers_ricochets' as const, cible: 1, progres: faite ? 1 : 0, faite, recuperee, recompense },
    ]
    vi.spyOn(api, 'etat').mockResolvedValue({ ...atteint, quetes_initiales: initiales(true, false) })
    const prise = vi.spyOn(api, 'queteInitiale').mockResolvedValue({
      ouvertures: [],
      etat: { ...atteint, version_etat: 2, quetes_initiales: initiales(true, true) },
    })
    render(<App api={api} catalogue={lecteurAvecJalon()} />)
    expect(await screen.findByText('Découvrez trois mots.')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Récupérer' }))
    expect(await screen.findByText(/Récompense ajoutée/)).toBeInTheDocument()
    expect(prise).toHaveBeenCalledWith(expect.objectContaining({ code: 'premiers_ricochets', fascicule_id: null, version_etat: 1 }))
  })

  it('explique l’absence de quête du jour', async () => {
    history.replaceState(null, '', '/#/quetes/journalieres')
    const { api } = client()
    render(<App api={api} catalogue={lecteurAvecJalon()} />)
    expect(await screen.findByText('Pas de quête aujourd’hui')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Récupérer votre récompense de fascicule' }))
    expect(await screen.findByRole('button', { name: 'Récupérer' })).toBeInTheDocument()
  })

  it('annonce le palier d’une quête au long cours et le récupère au clic', async () => {
    history.replaceState(null, '', '/#/quetes/au-long-cours')
    const api = new ClientApi('https://api.exemple.test')
    vi.spyOn(api, 'etat').mockResolvedValue(palierAtteint)
    vi.spyOn(api, 'sante').mockResolvedValue({ statut: 'ok', version_catalogue: 'v1', version_api: '0', revision_api: '', reinitialisation: false })
    const palier = vi.spyOn(api, 'palier').mockResolvedValue({
      etat: { ...palierAtteint, version_etat: 2, paliers_recuperes: [PALIER], encre: palierAtteint.encre + 5 },
    })
    render(<App api={api} catalogue={lecteurAvecQuete()} />)
    expect(await screen.findByRole('heading', { name: 'Grec ancien' })).toBeInTheDocument()
    expect(screen.getByText('5 gouttes d’encre')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Récupérer' }))
    expect(await screen.findByText(/^Récompense ajoutée : 5.gouttes d’encre et 1.sablier\.$/)).toBeInTheDocument()
    expect(palier).toHaveBeenCalledWith(expect.objectContaining({ palier_id: PALIER, version_etat: 1, version_catalogue: 'v1' }))
    expect(screen.getByText('✓ Récupérée')).toBeInTheDocument()
  })
})

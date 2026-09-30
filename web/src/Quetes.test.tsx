import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
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

  it('annonce les quêtes journalières à venir', async () => {
    history.replaceState(null, '', '/#/quetes/journalieres')
    const { api } = client()
    render(<App api={api} catalogue={lecteurAvecJalon()} />)
    expect(await screen.findByText('Bientôt disponibles')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Récupérer votre récompense de fascicule' }))
    expect(await screen.findByRole('button', { name: 'Récupérer' })).toBeInTheDocument()
  })
})

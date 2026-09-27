import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { Calendrier, Manifeste } from './contrat'
import { ClientApi, ErreurApi } from './services/api'
import { LecteurCatalogue } from './services/catalogue'

const H = '0'.repeat(64)

function catalogue(index: Calendrier | null, manifeste?: Partial<Manifeste>): LecteurCatalogue {
  const lecteur = new LecteurCatalogue('https://catalogue.exemple.test/public')
  vi.spyOn(lecteur, 'index').mockResolvedValue(index)
  vi.spyOn(lecteur, 'manifeste').mockResolvedValue({
    format: 1,
    numero: 0,
    parution: '2026-10-01T08:00:00+02:00',
    jaquette: `a/${H}.svg`,
    exclusions: null,
    cartes: [],
    langues: [],
    recettes: [],
    compteurs: { mots: 7 },
    pli: {},
    jalons: [],
    test: true,
    ...manifeste,
  })
  return lecteur
}

function api(etat: () => Promise<unknown>): ClientApi {
  const client = new ClientApi('https://api.exemple.test')
  vi.spyOn(client, 'etat').mockImplementation(etat as ClientApi['etat'])
  return client
}

const INDEX: Calendrier = {
  format: 1,
  version: 'v1',
  essai: true,
  referentiels: {},
  fascicules: [{ numero: 0, parution: '2026-10-01T08:00:00+02:00', manifeste: `f/${H}.json` }],
}

describe('App', () => {
  it('affiche les fascicules parus et leur jaquette', async () => {
    render(<App api={api(() => Promise.resolve({ version_etat: 0, version_catalogue: 'v1' }))} catalogue={catalogue(INDEX)} />)
    expect(await screen.findByRole('heading', { name: 'Fascicule n°\u00a00' })).toBeInTheDocument()
    expect(screen.getByText(/7 mots/)).toBeInTheDocument()
    expect(screen.getByText('Essai')).toBeInTheDocument()
    expect(await screen.findByText('Profil invité')).toBeInTheDocument()
    expect(document.querySelector('img.jaquette')).toHaveAttribute('src', `https://catalogue.exemple.test/public/a/${H}.svg`)
  })

  it('annonce un catalogue encore vide', async () => {
    render(<App api={api(() => Promise.resolve({ version_etat: 0, version_catalogue: null }))} catalogue={catalogue(null)} />)
    expect(await screen.findByText('Aucun fascicule n’est encore paru.')).toBeInTheDocument()
  })

  it('signale une API injoignable sans bloquer le catalogue', async () => {
    render(<App api={api(() => Promise.reject(new ErreurApi(0, 'reseau', 'x')))} catalogue={catalogue(INDEX)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('injoignable')
    expect(await screen.findByRole('heading', { name: 'Fascicule n°\u00a00' })).toBeInTheDocument()
  })
})

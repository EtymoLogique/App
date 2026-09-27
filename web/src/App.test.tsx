import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { ReponseFusion } from './contrat'
import { ClientApi, ErreurApi } from './services/api'
import type { LecteurCatalogue } from './services/catalogue'
import { effacerPartie } from './services/local'
import { GEO, LOGIE, MOT, RECETTE, etat, lecteurFictif } from './test/fixtures'

function client(fusion?: ClientApi['fusion']): ClientApi {
  const api = new ClientApi('https://api.exemple.test')
  vi.spyOn(api, 'etat').mockResolvedValue(etat())
  if (fusion) vi.spyOn(api, 'fusion').mockImplementation(fusion)
  return api
}

let lecteur: LecteurCatalogue

async function poser(...formes: string[]) {
  const reserve = await screen.findByRole('region', { name: 'Réserve' })
  for (const forme of formes) {
    fireEvent.click(within(reserve).getByText(forme).closest('button') as HTMLElement)
  }
}

describe('table de fusion', () => {
  beforeEach(async () => {
    lecteur = lecteurFictif()
    await effacerPartie()
  })

  it('affiche la réserve de départ et ses exemplaires', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    const reserve = await screen.findByRole('region', { name: 'Réserve' })
    expect(await within(reserve).findByLabelText('2 exemplaires')).toBeInTheDocument()
    expect(within(reserve).getByLabelText('1 exemplaire')).toBeInTheDocument()
    expect(screen.getByText('0 mot découvert sur 1')).toBeInTheDocument()
  })

  it('réserve un exemplaire par brique posée', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('logie')
    const reserve = screen.getByRole('region', { name: 'Réserve' })
    const logie = within(reserve).getByText('logie').closest('button') as HTMLElement
    expect(logie).toHaveAttribute('aria-disabled', 'true')
    expect(logie).toHaveAttribute('title', 'Tous ses exemplaires sont déjà sur la table.')
    expect(screen.getByRole('button', { name: 'Fusionner' })).toBeDisabled()
  })

  it('confirme une découverte et ouvre sa fiche', async () => {
    const reponse: ReponseFusion = {
      issue: { type: 'decouverte', recette_id: RECETTE, mot_id: MOT },
      etat: etat({
        version_etat: 2,
        reserve: [
          { brique_id: GEO, exemplaires: 1 },
          { brique_id: LOGIE, exemplaires: 0 },
        ],
        decouvertes: [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }],
      }),
    }
    const fusion = vi.fn<ClientApi['fusion']>().mockResolvedValue(reponse)
    render(<App api={client(fusion)} catalogue={lecteur} />)
    await poser('géo', 'logie')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Fusionner' })))

    expect(fusion).toHaveBeenCalledWith(
      expect.objectContaining({ version_etat: 1, version_catalogue: 'v1', briques: [GEO, LOGIE] }),
    )
    const fiche = await screen.findByRole('dialog', { name: 'géologie' })
    expect(within(fiche).getByText('Science de la Terre.')).toBeInTheDocument()
    expect(within(fiche).getByText('étude de la terre')).toBeInTheDocument()
    expect(within(fiche).getAllByText('−1')).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Réserve' })).getByText('Épuisée')).toBeInTheDocument()
    expect(screen.getByText('1 mot découvert sur 1')).toBeInTheDocument()
  })

  it('affiche la réponse du serveur, pas la prévisualisation', async () => {
    const fusion = vi.fn<ClientApi['fusion']>().mockResolvedValue({ issue: { type: 'presque', motif: 'ordre' }, etat: etat() })
    render(<App api={client(fusion)} catalogue={lecteur} />)
    await poser('logie', 'géo')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Fusionner' })))
    expect(await screen.findByText('Presque ! Les bonnes briques, mais pas dans le bon ordre.')).toBeInTheDocument()
    expect(screen.queryByText('En attente de confirmation…')).not.toBeInTheDocument()
  })

  it('se resynchronise après un conflit', async () => {
    const api = client(() => Promise.reject(new ErreurApi(409, 'conflit', 'version_etat périmée')))
    render(<App api={api} catalogue={lecteur} />)
    await poser('géo', 'logie')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Fusionner' })))
    expect(await screen.findByText(/Votre partie a changé entre-temps/)).toBeInTheDocument()
    expect(api.etat).toHaveBeenCalledTimes(2)
  })

  it('attend le réseau pour fusionner', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo', 'logie')
    expect(screen.getByRole('button', { name: 'Fusionner' })).toBeDisabled()
    expect(screen.getByText('Hors connexion : la fusion attend le réseau.')).toBeInTheDocument()
  })

  it('réordonne au clavier', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo', 'logie')
    fireEvent.click(screen.getByRole('button', { name: 'Avancer logie' }))
    const posees = within(screen.getByRole('list', { name: 'Briques posées, dans l’ordre' })).getAllByText(/géo|logie/)
    expect(posees.map((e) => e.textContent)).toEqual(['logie', 'géo'])
  })
})

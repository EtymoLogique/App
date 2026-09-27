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

async function poser(...libelles: string[]) {
  const reserve = await screen.findByRole('region', { name: 'Réserve · exemplaires' })
  for (const libelle of libelles) {
    fireEvent.click(within(reserve).getByText(libelle).closest('button') as HTMLElement)
  }
}

describe('table de fusion', () => {
  beforeEach(async () => {
    lecteur = lecteurFictif()
    await effacerPartie()
  })

  it('affiche la réserve de départ et ses exemplaires', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    const reserve = await screen.findByRole('region', { name: 'Réserve · exemplaires' })
    expect(await within(reserve).findByRole('button', { name: 'Poser géo- (terre) sur la table. 2 exemplaires disponibles' })).toBeInTheDocument()
    expect(within(reserve).getByRole('button', { name: 'Poser -logie (étude) sur la table. 1 exemplaire disponible' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Mots découverts' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('réserve un exemplaire par brique posée', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('-logie')
    const reserve = screen.getByRole('region', { name: 'Réserve · exemplaires' })
    const logie = within(reserve).getByText('-logie').closest('button') as HTMLElement
    expect(logie).toHaveAttribute('aria-disabled', 'true')
    expect(logie).toHaveClass('is-out')
    fireEvent.click(logie)
    expect(screen.getByText('Tous vos exemplaires de -logie sont déjà sur la table.')).toBeInTheDocument()
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
    await poser('géo-', '-logie')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Fusionner' })))

    expect(fusion).toHaveBeenCalledWith(
      expect.objectContaining({ version_etat: 1, version_catalogue: 'v1', briques: [GEO, LOGIE] }),
    )
    const fiche = await screen.findByRole('article', { name: 'géologie' })
    expect(screen.getByLabelText('1 nouveauté')).toBeInTheDocument()
    expect(within(fiche).getByRole('button', { name: /Ouvrir un pli/ })).toBeInTheDocument()
    expect(within(fiche).getByText('Découverte 1 / 1')).toBeInTheDocument()
    expect(within(fiche).getByText('Science de la Terre.')).toBeInTheDocument()
    expect(within(fiche).getByText(/étude de la terre/)).toBeInTheDocument()
    expect(within(fiche).getByLabelText('préfixe géo- : −1, reste 1')).toBeInTheDocument()
    expect(within(fiche).getByLabelText('suffixe -logie : −1, épuisée')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Réserve · exemplaires' })).getByText('épuisée')).toBeInTheDocument()
    fireEvent.click(within(fiche).getByRole('button', { name: 'Continuer' }))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Mots découverts' })).toHaveAttribute('aria-valuenow', '1')
    // Le codex signale la carte nouvelle, jusqu'à ce qu'on l'ouvre.
    fireEvent.click(screen.getByRole('button', { name: /^Codex/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Nouvelle carte : géologie/ }))
    expect(screen.getByRole('dialog', { name: 'géologie' })).toBeInTheDocument()
    expect(screen.queryByLabelText('1 nouveauté')).not.toBeInTheDocument()
  })

  it('affiche la réponse du serveur, pas la prévisualisation', async () => {
    const fusion = vi.fn<ClientApi['fusion']>().mockResolvedValue({ issue: { type: 'presque', motif: 'ordre' }, etat: etat() })
    render(<App api={client(fusion)} catalogue={lecteur} />)
    await poser('-logie', 'géo-')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Fusionner' })))
    const retour = await screen.findByText('Bonnes briques… mais l’ordre compte.')
    expect(retour).toHaveAttribute('data-tone', 'hint')
    expect(screen.queryByText('En attente de confirmation.')).not.toBeInTheDocument()
  })

  it('se resynchronise après un conflit', async () => {
    const api = client(() => Promise.reject(new ErreurApi(409, 'conflit', 'version_etat périmée')))
    render(<App api={api} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Fusionner' })))
    expect(await screen.findByText(/Votre partie a changé entre-temps/)).toBeInTheDocument()
    expect(api.etat).toHaveBeenCalledTimes(2)
  })

  it('attend le réseau pour fusionner', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    expect(screen.getByRole('button', { name: 'Fusionner' })).toBeDisabled()
    expect(screen.getAllByText(/la fusion attendra le retour du réseau/).length).toBeGreaterThanOrEqual(1)
  })

  it('rend à la réserve la brique posée qu’on touche', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    fireEvent.click(screen.getByRole('button', { name: 'Emplacement 1 : géo-. Retirer' }))
    expect(screen.getByRole('button', { name: 'Emplacement 1 : -logie. Retirer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Poser géo- (terre) sur la table. 2 exemplaires disponibles' })).toBeInTheDocument()
  })

  it('mène aux plis quand la réserve ne permet plus de découverte', async () => {
    const api = new ClientApi('https://api.exemple.test')
    vi.spyOn(api, 'etat').mockResolvedValue(etat({ reserve: [{ brique_id: GEO, exemplaires: 2 }, { brique_id: LOGIE, exemplaires: 0 }] }))
    render(<App api={api} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aller aux plis' }))
    expect(screen.getByRole('heading', { name: 'Plis', level: 1 })).toBeVisible()
  })

  it('applique le thème choisi dans les réglages', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }))
    fireEvent.click(screen.getByLabelText('Nocturne'))
    expect(document.documentElement.dataset.theme).toBe('nocturne')
    fireEvent.click(screen.getByLabelText('Système'))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})

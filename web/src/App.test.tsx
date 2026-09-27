import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { ReponseFusion } from './contrat'
import { ClientApi, ErreurApi } from './services/api'
import type { LecteurCatalogue } from './services/catalogue'
import { effacerPartie } from './services/local'
import { GEO, LOGIE, MOT, RECETTE, etat, ex, lecteurFictif } from './test/fixtures'

function client(fusion?: ClientApi['fusion']): ClientApi {
  const api = new ClientApi('https://api.exemple.test')
  vi.spyOn(api, 'etat').mockResolvedValue(etat())
  if (fusion) vi.spyOn(api, 'fusion').mockImplementation(fusion)
  return api
}

let lecteur: LecteurCatalogue

const reserve = () => screen.findByRole('region', { name: /^Réserve/ })
const brique = async (libelle: string) => within(await reserve()).getByText(libelle).closest('button') as HTMLElement
/** Le bouton Fusionner de l'ordinateur (le premier) ; celui du mobile a le même rôle. */
const fusionner = () => screen.getAllByRole('button', { name: 'Fusionner' })[0] as HTMLElement

/** Pose des briques d'un seul clic, comme dans jeu.html. */
async function poser(...libelles: string[]) {
  for (const libelle of libelles) fireEvent.click(await brique(libelle))
}

describe('table de fusion', () => {
  beforeEach(async () => {
    lecteur = lecteurFictif()
    await effacerPartie()
    history.replaceState(null, '', '/')
  })

  it('affiche la réserve de départ, sa recherche et ses filtres', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    const r = await reserve()
    expect(r).toHaveAccessibleName('Réserve · 3 exemplaires')
    expect(await within(r).findByRole('button', { name: 'Poser géo- (terre) sur la table. 2 exemplaires disponibles' })).toBeInTheDocument()
    fireEvent.change(within(r).getByRole('searchbox', { name: 'Chercher une brique ou un sens' }), { target: { value: 'etude' } })
    expect(within(r).queryByText('géo-')).not.toBeInTheDocument()
    expect(within(r).getByText('-logie')).toBeInTheDocument()
    expect(screen.getByText('0 / 1 mots')).toBeInTheDocument()
  })

  it('pose une brique d’un seul clic', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    fireEvent.click(await brique('géo-'))
    expect(screen.getByRole('button', { name: 'Emplacement 1 : géo-. Retirer' })).toBeInTheDocument()
    expect(screen.getByText('Posez une deuxième brique.')).toBeInTheDocument()
  })

  it('ne remplace rien quand la table est pleine', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo-', '-logie', 'géo-')
    expect(screen.getByRole('button', { name: 'Emplacement 1 : géo-. Retirer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emplacement 2 : -logie. Retirer' })).toBeInTheDocument()
  })

  it('réserve un exemplaire par brique posée', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('-logie')
    const logie = await brique('-logie')
    expect(logie).toHaveAttribute('aria-disabled', 'true')
    expect(logie).toHaveClass('is-out')
    fireEvent.click(logie)
    expect(screen.getByText('Tous vos exemplaires de -logie sont déjà sur la table.')).toBeInTheDocument()
    expect(fusionner()).toBeDisabled()
  })

  it('confirme une découverte et ouvre sa fiche', async () => {
    const reponse: ReponseFusion = {
      issue: { type: 'decouverte', recette_id: RECETTE, mot_id: MOT },
      etat: etat({
        version_etat: 2,
        reserve: [ex(GEO, 1), ex(LOGIE, 0)],
        decouvertes: [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }],
      }),
    }
    const fusion = vi.fn<ClientApi['fusion']>().mockResolvedValue(reponse)
    render(<App api={client(fusion)} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    await act(async () => fireEvent.click(fusionner()))

    expect(fusion).toHaveBeenCalledWith(expect.objectContaining({ version_etat: 1, version_catalogue: 'v1', briques: [GEO, LOGIE] }))
    const fiche = await screen.findByRole('dialog', { name: 'géologie' })
    expect(within(fiche).getByText(/^Nouvelle découverte · N°/)).toBeInTheDocument()
    expect(within(fiche).getByText('Science de la Terre.')).toBeInTheDocument()
    expect(within(fiche).getByText(/étude de la terre/)).toBeInTheDocument()
    expect(within(fiche).getByLabelText('préfixe géo- : −1, reste 1')).toBeInTheDocument()
    expect(within(fiche).getByLabelText('suffixe -logie : −1, épuisée')).toBeInTheDocument()
    expect(screen.getByLabelText('1 nouveauté')).toBeInTheDocument()
    fireEvent.click(within(fiche).getByRole('button', { name: 'Continuer' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('1 / 1 mots')).toBeInTheDocument()

    // Dans le codex, la carte nouvelle s'ouvre ; la nouveauté s'efface une fois vue.
    fireEvent.click(screen.getByRole('button', { name: /^Codex/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Nouvelle carte : géologie/ }))
    expect(await screen.findByRole('dialog', { name: 'géologie' })).toBeInTheDocument()
    expect(screen.queryByLabelText('1 nouveauté')).not.toBeInTheDocument()
  })

  it('relie les cartes du codex qui se font référence, avec un fil d’Ariane', async () => {
    const api = new ClientApi('https://api.exemple.test')
    vi.spyOn(api, 'etat').mockResolvedValue(
      etat({ decouvertes: [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }] }),
    )
    render(<App api={api} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Codex/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^géologie, mot/ }))
    const carte = await screen.findByRole('dialog', { name: 'géologie' })
    fireEvent.click(within(carte).getAllByRole('link', { name: 'Ouvrir la carte géo-' })[0] as HTMLElement)
    const brique = await screen.findByRole('dialog', { name: 'géo-' })
    expect(within(brique).getByRole('navigation', { name: 'Parcours entre les cartes' })).toHaveTextContent('géologie')
    fireEvent.click(within(brique).getByRole('button', { name: 'Revenir à la carte géologie' }))
    expect(await screen.findByRole('dialog', { name: 'géologie' })).toBeInTheDocument()
  })

  it('propose d’inverser quand l’ordre est faux', async () => {
    const fusion = vi.fn<ClientApi['fusion']>().mockResolvedValue({ issue: { type: 'presque', motif: 'ordre' }, etat: etat() })
    render(<App api={client(fusion)} catalogue={lecteur} />)
    await poser('-logie', 'géo-')
    await act(async () => fireEvent.click(fusionner()))
    expect(await screen.findByText('Ces briques vont ensemble, mais pas dans cet ordre. Rien n’est perdu.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inverser' }))
    expect(screen.getByRole('button', { name: 'Emplacement 1 : géo-. Retirer' })).toBeInTheDocument()
  })

  it('refuse doucement un échec : secousse brève, aucune perte', async () => {
    const fusion = vi.fn<ClientApi['fusion']>().mockResolvedValue({ issue: { type: 'echec' }, etat: etat() })
    render(<App api={client(fusion)} catalogue={lecteur} />)
    await poser('géo-', 'géo-')
    await act(async () => fireEvent.click(fusionner()))
    const retour = await screen.findByText('Aucune recette connue. Rien n’est perdu : essayez autre chose.')
    expect(retour).toHaveAttribute('data-tone', 'fail')
    expect(document.querySelector('.slots.shake')).not.toBeNull()
  })

  it('rappelle la fiche d’un mot déjà découvert', async () => {
    const fusion = vi.fn<ClientApi['fusion']>().mockResolvedValue({ issue: { type: 'connue', recette_id: RECETTE, mot_id: MOT }, etat: etat() })
    render(<App api={client(fusion)} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    await act(async () => fireEvent.click(fusionner()))
    expect(await screen.findByText(/Rien n’est consommé/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voir la carte' })).toBeInTheDocument()
  })

  it('se resynchronise après un conflit', async () => {
    const api = client(() => Promise.reject(new ErreurApi(409, 'conflit', 'version_etat périmée')))
    render(<App api={api} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    await act(async () => fireEvent.click(fusionner()))
    expect(await screen.findByText(/Votre partie a changé entre-temps/)).toBeInTheDocument()
    expect(api.etat).toHaveBeenCalledTimes(2)
  })

  it('attend le réseau pour fusionner', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    expect(fusionner()).toBeDisabled()
    expect(screen.getAllByText(/la fusion attendra le retour du réseau/).length).toBeGreaterThanOrEqual(1)
  })

  it('vide une case qu’on touche sans déplacer l’autre, et réordonne au clavier', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Emplacement 2 : -logie. Retirer' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('button', { name: 'Emplacement 1 : -logie. Retirer' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Emplacement 1 : -logie. Retirer' }))
    // La seconde brique reste dans sa case ; la première case est libre.
    expect(screen.getByRole('button', { name: 'Emplacement 1 vide' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emplacement 2 : géo-. Retirer' })).toBeInTheDocument()
    // Une nouvelle brique vient dans la case libérée.
    await poser('-logie')
    expect(screen.getByRole('button', { name: 'Emplacement 1 : -logie. Retirer' })).toBeInTheDocument()
  })

  it('dit quand aucun mot n’est plus possible, et mène aux plis', async () => {
    const api = new ClientApi('https://api.exemple.test')
    vi.spyOn(api, 'etat').mockResolvedValue(etat({ reserve: [ex(GEO, 2), ex(LOGIE, 0)] }))
    render(<App api={api} catalogue={lecteur} />)
    expect(await screen.findByText('Aucun mot possible pour l’instant')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aller aux plis' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plis', level: 1 })).toBeVisible())
  })

  it('applique le thème choisi dans les réglages', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }))
    fireEvent.click(screen.getByLabelText('Nocturne'))
    expect(document.documentElement.dataset.theme).toBe('nocturne')
    fireEvent.click(screen.getByLabelText('Système'))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('revient au même écran après un rechargement', async () => {
    const api = new ClientApi('https://api.exemple.test')
    vi.spyOn(api, 'etat').mockResolvedValue(
      etat({ decouvertes: [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }] }),
    )
    const { unmount } = render(<App api={api} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Codex/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Mots/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^géologie, mot/ }))
    await screen.findByRole('dialog', { name: 'géologie' })
    expect(window.location.hash).toBe(`#/codex/${MOT}?type=mot`)
    unmount()

    // Rechargement : même onglet, même filtre, même carte ouverte.
    render(<App api={api} catalogue={lecteur} />)
    expect(await screen.findByRole('dialog', { name: 'géologie' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Mots/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

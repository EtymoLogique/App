import { act, fireEvent, render, screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { ReponseFusion, ReponsePli } from './contrat'
import { ClientApi, ErreurApi } from './services/api'
import type { LecteurCatalogue } from './services/catalogue'
import { effacerPartie } from './services/local'
import { GEO, LOGIE, MOT, RECETTE, etat, ex, lecteurFictif } from './test/fixtures'

function client(fusion?: ClientApi['fusion']): ClientApi {
  const api = new ClientApi('https://api.exemple.test')
  vi.spyOn(api, 'etat').mockResolvedValue(etat())
  vi.spyOn(api, 'sante').mockResolvedValue({ statut: 'ok', version_catalogue: 'v1', version_api: '0', revision_api: '', reinitialisation: false })
  if (fusion) vi.spyOn(api, 'fusion').mockImplementation(fusion)
  return api
}

let lecteur: LecteurCatalogue

/** La réserve est une modale : on l'ouvre par le bouton dédié si elle ne l'est pas déjà. */
const reserve = async () => {
  if (!screen.queryByRole('dialog', { name: /^Réserve/ })) fireEvent.click(await screen.findByRole('button', { name: /^Réserve/ }))
  return screen.findByRole('dialog', { name: /^Réserve/ })
}
const plateau = async () => within(await reserve()).getByRole('list', { name: 'Briques de la réserve' })
const brique = async (libelle: string) => within(await plateau()).getByText(libelle).closest('button') as HTMLElement
const modaleReserve = () => screen.queryByRole('dialog', { name: /^Réserve/ })
const caseLibre = () => document.querySelector('.rm-case:not(.filled)') !== null
/** Le bouton Fusionner de l'ordinateur (le premier) ; celui du mobile a le même rôle. */
const fusionner = () => screen.getAllByRole('button', { name: 'Fusionner' })[0] as HTMLElement

/** Pose des briques d'un seul clic, comme dans jeu.html. La table complétée, la modale se ferme d'elle-même. */
async function poser(...libelles: string[]) {
  for (const libelle of libelles) {
    const b = await brique(libelle)
    const libre = caseLibre()
    fireEvent.click(b)
    if (libre && !caseLibre()) await waitForElementToBeRemoved(modaleReserve)
  }
}

describe('table de fusion', () => {
  beforeEach(async () => {
    lecteur = lecteurFictif()
    await effacerPartie()
    history.replaceState(null, '', '/')
  })

  it('affiche la réserve de départ, sa recherche et ses filtres', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    expect(screen.queryByRole('dialog', { name: /^Réserve/ })).not.toBeInTheDocument()
    const r = await reserve()
    expect(r).toHaveAccessibleName('Réserve · 3 exemplaires')
    expect(await within(r).findByRole('button', { name: 'Poser géo- (terre) sur la table. 2 exemplaires disponibles' })).toBeInTheDocument()
    fireEvent.change(within(r).getByRole('searchbox', { name: 'Chercher une brique ou un sens' }), { target: { value: 'etude' } })
    expect(within(r).queryByText('géo-')).not.toBeInTheDocument()
    expect(within(r).getByText('-logie')).toBeInTheDocument()
  })

  it('pose une brique d’un seul clic', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    fireEvent.click(await brique('géo-'))
    expect(screen.getByRole('button', { name: 'Emplacement 1 : géo-. Retirer' })).toBeInTheDocument()
    expect(screen.getByText('Posez une deuxième brique.')).toBeInTheDocument()
  })

  it('pose sur la case touchée, reste ouverte pour l’autre, puis se ferme sur « Fusionner »', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Emplacement 2 vide. Choisir une brique' }))
    const r = await reserve()
    expect(within(r).getByRole('button', { name: 'Case 2 vide, à remplir' })).toHaveAttribute('aria-current', 'step')
    fireEvent.click(await brique('géo-'))
    expect(screen.getByRole('button', { name: 'Emplacement 2 : géo-. Retirer' })).toBeInTheDocument()
    // La modale reste ouverte et vise la case restante.
    expect(modaleReserve()).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: 'Case 2 : géo-. Retirer' })).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: 'Case 1 vide, à remplir' })).toBeInTheDocument()
    expect(within(r).getByText('Choisissez la 1ʳᵉ brique')).toBeInTheDocument()
    expect(within(r).getByText('géo- posée en case 2. Choisissez la 1ʳᵉ brique.')).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: 'Retour à la table' })).toBeInTheDocument()
    fireEvent.click(await brique('-logie'))
    await waitForElementToBeRemoved(modaleReserve)
    expect(screen.getByRole('button', { name: 'Emplacement 1 : -logie. Retirer' })).toBeInTheDocument()
    expect(fusionner()).toHaveFocus()
  })

  it('retire une brique depuis la table de la réserve, et pose la suivante à sa place', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo-')
    const r = await reserve()
    fireEvent.click(within(r).getByRole('button', { name: 'Case 1 : géo-. Retirer' }))
    expect(screen.getByRole('button', { name: 'Emplacement 1 vide. Choisir une brique' })).toBeInTheDocument()
    expect(within(r).getByText('géo- retirée de la case 1. Choisissez la 1ʳᵉ brique.')).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
    await poser('-logie')
    expect(screen.getByRole('button', { name: 'Emplacement 1 : -logie. Retirer' })).toBeInTheDocument()
    expect(modaleReserve()).toBeInTheDocument()
  })

  it('pose la brique choisie au bouton dans la case vide la plus à gauche', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    fireEvent.click(screen.getByRole('button', { name: 'Emplacement 1 : géo-. Retirer' }))
    await poser('géo-')
    expect(screen.getByRole('button', { name: 'Emplacement 1 : géo-. Retirer' })).toBeInTheDocument()
    expect(modaleReserve()).not.toBeInTheDocument()
  })

  it('ferme la modale à Échap ou au clic sur le fond, et rend le focus au déclencheur', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    const declencheur = await screen.findByRole('button', { name: /^Réserve/ })
    declencheur.focus()
    const r = await reserve()
    // Le clavier mobile ne s’ouvre pas tout seul : le focus initial est sur « Fermer », pas sur la recherche.
    expect(within(r).getByRole('button', { name: 'Fermer' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /^Réserve/ })).not.toBeInTheDocument()
    expect(declencheur).toHaveFocus()
    await reserve()
    fireEvent.click(document.querySelector('.scrim') as HTMLElement)
    expect(screen.queryByRole('dialog', { name: /^Réserve/ })).not.toBeInTheDocument()
  })

  it('garde le focus dans la modale', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    const r = await reserve()
    const controles = within(r).getAllByRole('button').filter((b) => b.getAttribute('aria-disabled') !== 'true')
    const dernier = controles[controles.length - 1] as HTMLElement
    dernier.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(within(r).getByRole('button', { name: 'Fermer' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(dernier).toHaveFocus()
  })

  it('dit que la table est pleine sans fermer la modale', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo-', '-logie', 'géo-')
    expect(within(screen.getByRole('dialog', { name: /^Réserve/ })).getByText(/La table est pleine/)).toBeInTheDocument()
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

  it('confirme une découverte et ouvre sa carte, la même qu’au codex', async () => {
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
    const carte = await screen.findByRole('dialog', { name: 'géologie' })
    expect(carte).toHaveClass('viewer')
    expect(within(carte).getByText('Science de la Terre.')).toBeInTheDocument()
    expect(within(carte).queryByRole('button', { name: 'Carte suivante' })).not.toBeInTheDocument()
    expect(window.location.hash).not.toMatch(/codex/)
    expect(screen.getByLabelText('1 nouveauté')).toBeInTheDocument()
    fireEvent.click(within(carte).getByRole('button', { name: 'Fermer la carte' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

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

  it('ouvre la carte d’un mot déjà découvert et vide la table', async () => {
    const connu = etat({ decouvertes: [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }] })
    const fusion = vi.fn<ClientApi['fusion']>().mockResolvedValue({ issue: { type: 'connue', recette_id: RECETTE, mot_id: MOT }, etat: connu })
    render(<App api={client(fusion)} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    await act(async () => fireEvent.click(fusionner()))
    expect(await screen.findByRole('dialog', { name: 'géologie' })).toHaveClass('viewer')
    expect(screen.queryByRole('button', { name: 'Voir la carte' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Emplacement 1 : / })).not.toBeInTheDocument()
  })

  it('se resynchronise après un conflit', async () => {
    const api = client(() => Promise.reject(new ErreurApi(409, 'conflit', 'version_etat périmée')))
    render(<App api={api} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    await act(async () => fireEvent.click(fusionner()))
    expect(await screen.findByText(/Votre partie a changé entre-temps/)).toBeInTheDocument()
    expect(api.etat).toHaveBeenCalledTimes(2)
  })

  it('hors ligne, consulte seulement : rien ne se pose', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<App api={client()} catalogue={lecteur} />)
    expect(await screen.findByRole('button', { name: /^Réserve/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Emplacement 1 vide. Choisir une brique' }))
    expect(screen.queryByRole('dialog', { name: /^Réserve/ })).not.toBeInTheDocument()
    expect(screen.getAllByText(/consultation seulement/).length).toBeGreaterThanOrEqual(1)
    expect(fusionner()).toBeDisabled()
  })

  it('vide une case qu’on touche sans déplacer l’autre, et réordonne au clavier', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    await poser('géo-', '-logie')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Emplacement 2 : -logie. Retirer' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('button', { name: 'Emplacement 1 : -logie. Retirer' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Emplacement 1 : -logie. Retirer' }))
    // La seconde brique reste dans sa case ; la première case est libre.
    expect(screen.getByRole('button', { name: 'Emplacement 1 vide. Choisir une brique' })).toBeInTheDocument()
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
    expect(document.documentElement.dataset.theme).toBe('atelier')
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

  it('cherche dans le codex parmi les seules cartes découvertes', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Codex/ }))
    const champ = await screen.findByRole('searchbox', { name: /parmi les cartes découvertes/ })
    // « terre » est aussi la piste du mot à trouver : seule la brique répond.
    fireEvent.change(champ, { target: { value: 'terre' } })
    expect(screen.getByText('Briques · 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^géo-, préfixe/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /à découvrir/ })).not.toBeInTheDocument()
    fireEvent.change(champ, { target: { value: 'géologie' } })
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    expect(champ).toHaveValue('')
    // La recherche ne s'écrit jamais dans l'adresse (ADR 0034).
    expect(window.location.hash).toBe('#/codex')
  })

  it('tient la vue du codex dans l’adresse : familles et cabinet', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Codex/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Familles/ }))
    expect(window.location.hash).toBe('#/codex?vue=familles')
    expect(screen.getByRole('region', { name: 'Famille de géo- : 0 mots trouvés sur 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Cabinet/ }))
    expect(window.location.hash).toBe('#/codex?vue=cabinet')
    const badge = screen.getByRole('button', { name: 'Famille de géo-, terre : 0 mot sur 1' })
    expect(badge).toHaveTextContent('0 / 1')
    // Le badge mène à la famille, dans la vue Familles.
    fireEvent.click(badge)
    expect(window.location.hash).toBe('#/codex?vue=familles')
  })

  it('montre le cabinet du joueur : ses nombres seuls, sans total des légendaires', async () => {
    window.location.hash = '#/codex?vue=objectifs'
    const api = new ClientApi('https://api.exemple.test')
    vi.spyOn(api, 'etat').mockResolvedValue(etat({ jours_de_jeu: 12 }))
    render(<App api={api} catalogue={lecteur} />)
    // Une ancienne adresse « Objectifs » ouvre le cabinet.
    expect(await screen.findByRole('button', { name: /^Cabinet/ })).toHaveAttribute('aria-pressed', 'true')
    const cabinet = await screen.findByRole('region', { name: 'Votre cabinet' })
    await within(cabinet).findByText('jours de jeu')
    expect(within(cabinet).getByText('12')).toBeInTheDocument()
    expect(within(cabinet).getByText('mot trouvé')).toBeInTheDocument()
    expect(within(cabinet).getByText('légendaire trouvée')).toBeInTheDocument()
    expect(cabinet).not.toHaveTextContent(/sur|maîtrisée|lecteur/)
    // Aucun mot trouvé : pas de voyage.
    expect(within(cabinet).queryByText('Mot au plus long voyage')).not.toBeInTheDocument()
  })

  it('joint les segments d’une famille complète et montre le mot au plus long voyage', async () => {
    window.location.hash = '#/codex?vue=cabinet'
    const api = new ClientApi('https://api.exemple.test')
    vi.spyOn(api, 'etat').mockResolvedValue(
      etat({ decouvertes: [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }] }),
    )
    render(<App api={api} catalogue={lecteur} />)
    const badge = await screen.findByRole('button', { name: 'Famille de géo-, terre : 1 mot sur 1' })
    expect(badge).toHaveTextContent('1 / 1')
    expect(badge.querySelector('circle')).toHaveAttribute('stroke-dasharray', '100 100')
    const cabinet = screen.getByRole('region', { name: 'Votre cabinet' })
    expect(within(cabinet).getByText('Mot au plus long voyage')).toBeInTheDocument()
    expect(within(cabinet).getByText('géologie')).toBeInTheDocument()
    // État d'avant App#25 : pas de jours de jeu plutôt qu'un nombre faux.
    expect(within(cabinet).queryByText(/jours? de jeu/)).not.toBeInTheDocument()
  })

  it('ouvre « En savoir plus » depuis la carte vue au codex, jusque dans l’adresse', async () => {
    const api = new ClientApi('https://api.exemple.test')
    vi.spyOn(api, 'etat').mockResolvedValue(
      etat({ decouvertes: [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }] }),
    )
    render(<App api={api} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Codex/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^géologie, mot/ }))

    const carte = await screen.findByRole('dialog', { name: 'géologie' })
    expect(window.location.hash).toBe(`#/codex/${MOT}`)
    const plus = within(carte).getByRole('button', { name: 'En savoir plus' })
    expect(within(carte).queryByRole('button', { name: 'Voir les formes' })).not.toBeInTheDocument()
    fireEvent.click(plus)
    expect(window.location.hash).toBe(`#/codex/${MOT}?plus=1`)
    expect(within(carte).getByRole('tab', { name: 'En savoir plus' })).toHaveAttribute('aria-selected', 'true')
    expect(within(carte).getByRole('tabpanel', { name: 'En savoir plus' })).toHaveTextContent('version du catalogue v1')
    expect(within(carte).getByText('Verso : en savoir plus')).toBeInTheDocument()
    fireEvent.click(within(carte).getByRole('tab', { name: 'Formes' }))
    expect(window.location.hash).toBe(`#/codex/${MOT}`)
    fireEvent.click(within(carte).getByRole('button', { name: 'Retourner' }))
    expect(within(carte).getByText('Recto')).toBeInTheDocument()
    await waitFor(() => expect(plus).toHaveFocus())
  })

  it('replie un groupe de cartes dans le tri par fascicule', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Codex/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Fascicule' }))
    const groupe = screen.getByRole('button', { name: /^Fascicule Essai, n°\s0 : .*Replier le groupe/ })
    expect(screen.getByRole('button', { name: /^géo-, préfixe/ })).toBeInTheDocument()
    fireEvent.click(groupe)
    expect(groupe).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /^géo-, préfixe/ })).not.toBeInTheDocument()
    fireEvent.click(groupe)
    expect(screen.getByRole('button', { name: /^géo-, préfixe/ })).toBeInTheDocument()
  })

  it('inverse le tri quand on touche à nouveau le tri actif', async () => {
    render(<App api={client()} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Codex/ }))
    await screen.findByRole('button', { name: /^géo-, préfixe/ })
    const numeros = () => Array.from(document.querySelectorAll('.cb-grid .mini'), (b) => b.getAttribute('aria-label'))
    const avant = numeros()
    expect(avant.length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: /^N°, ordre croissant/ }))
    expect(window.location.hash).toBe('#/codex?sens=inverse')
    expect(numeros()).toEqual([...avant].reverse())
    // Un autre tri repart dans l'ordre croissant.
    fireEvent.click(screen.getByRole('button', { name: 'A → Z' }))
    expect(window.location.hash).toBe('#/codex?tri=az')
  })

  it('ouvre le pli d’un fascicule et révèle la brique donnée par le serveur', async () => {
    document.documentElement.dataset.mouvement = 'reduit'
    const api = client()
    const reponse: ReponsePli = {
      ouverture: { fascicule_id: 'fsc_00000000', brique_id: GEO, resultat: 'doublon', regle: 'tirage', encre: 3, ouvert_le: '2026-10-02T10:00:00Z' },
      exemplaires: 3,
      etait_epuisee: false,
      etat: etat({
        version_etat: 2,
        reserve: [ex(GEO, 3), ex(LOGIE, 1)],
        encre: 3,
        energie: { charges: 1, capacite: 2, prochaine_charge: '2026-10-02T22:00:00Z', recharge_s: 43_200 },
      }),
    }
    const pli = vi.spyOn(api, 'pli').mockResolvedValue(reponse)
    render(<App api={api} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Plis/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Fascicule Essai, n°\s0 : .*Ouvrir son pli/ }))
    expect(window.location.hash).toBe('#/plis/fsc_00000000')
    const pack = await screen.findByRole('button', { name: 'Ouvrir le pli du fascicule Essai' })
    await act(async () => fireEvent.click(pack))
    expect(pli).toHaveBeenCalledWith(expect.objectContaining({ fascicule_id: 'fsc_00000000', version_etat: 1, version_catalogue: 'v1' }))
    expect(await screen.findByText('+1 exemplaire', undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('+1 exemplaire : ×3 dans votre réserve · +3 gouttes d’encre')).toHaveAttribute('role', 'status')
    // Le menu « Plis » ramène au choix du fascicule.
    fireEvent.click(screen.getByRole('button', { name: /^Plis/ }))
    await waitFor(() => expect(window.location.hash).toBe('#/plis'))
    delete document.documentElement.dataset.mouvement
  })

  it('achète des sabliers depuis les plis et les emploie aussitôt, sur l’état renvoyé par l’achat', async () => {
    document.documentElement.dataset.mouvement = 'reduit'
    const api = client()
    const energie = { charges: 0, capacite: 2, prochaine_charge: new Date(Date.now() + 3_600_000).toISOString(), recharge_s: 43_200 }
    vi.spyOn(api, 'etat').mockResolvedValue(etat({ encre: 100, energie, sabliers: { detenus: 0, prix_gouttes: 10 } }))
    const achat = vi.spyOn(api, 'achatSablier').mockResolvedValue({ prix: 60, etat: etat({ version_etat: 2, encre: 40, energie, sabliers: { detenus: 6, prix_gouttes: 10 } }) })
    const emploi = vi.spyOn(api, 'sablier').mockResolvedValue({ etat: etat({ version_etat: 3, encre: 40, energie, sabliers: { detenus: 0, prix_gouttes: 10 } }) })
    render(<App api={api} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Plis/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Fascicule Essai, n°\s0 : .*Ouvrir son pli/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Acheter des sabliers' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Six sabliers contre 60 gouttes' })))
    expect(achat).toHaveBeenCalledWith(expect.objectContaining({ version_etat: 1, nombre: 6 }))
    // Le second envoi part de la version renvoyée par l'achat, sinon le serveur répondrait 409.
    await waitFor(() => expect(emploi).toHaveBeenCalledWith(expect.objectContaining({ version_etat: 2, nombre: 6 })))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    delete document.documentElement.dataset.mouvement
  })

  it('n’emploie que les sabliers qui remplissent l’énergie, le reste est gardé', async () => {
    document.documentElement.dataset.mouvement = 'reduit'
    const api = client()
    const energie = { charges: 1, capacite: 2, prochaine_charge: new Date(Date.now() + 3_600_000).toISOString(), recharge_s: 43_200 }
    vi.spyOn(api, 'etat').mockResolvedValue(etat({ encre: 200, energie, sabliers: { detenus: 0, prix_gouttes: 10 } }))
    vi.spyOn(api, 'achatSablier').mockResolvedValue({ prix: 120, etat: etat({ version_etat: 2, encre: 80, energie, sabliers: { detenus: 12, prix_gouttes: 10 } }) })
    const emploi = vi.spyOn(api, 'sablier').mockResolvedValue({ etat: etat({ version_etat: 3, encre: 80, sabliers: { detenus: 11, prix_gouttes: 10 } }) })
    render(<App api={api} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Plis/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Fascicule Essai, n°\s0 : .*Ouvrir son pli/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Acheter des sabliers' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Douze sabliers contre 120 gouttes' })))
    await waitFor(() => expect(emploi).toHaveBeenCalledWith(expect.objectContaining({ version_etat: 2, nombre: 1 })))
    delete document.documentElement.dataset.mouvement
  })

  it('n’offre pas la réinitialisation en production', async () => {
    history.replaceState(null, '', '#/reglages')
    render(<App api={client()} catalogue={lecteur} />)
    await waitFor(() => expect(screen.getByText('Profil invité')).toBeVisible())
    expect(screen.queryByRole('button', { name: 'Réinitialiser' })).not.toBeInTheDocument()
  })

  it('réinitialise hors production, après confirmation', async () => {
    const api = client()
    vi.spyOn(api, 'sante').mockResolvedValue({ statut: 'ok', version_catalogue: 'v1', version_api: '0', revision_api: '', reinitialisation: true })
    const reset = vi.spyOn(api, 'reinitialiser').mockResolvedValue(etat({ version_etat: 5, encre: 10_000 }))
    history.replaceState(null, '', '#/reglages')
    render(<App api={api} catalogue={lecteur} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Réinitialiser' }))
    expect(reset).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la réinitialisation' }))
    expect(await screen.findByText('Partie réinitialisée : codex vide, 10 000 gouttes.')).toBeInTheDocument()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})

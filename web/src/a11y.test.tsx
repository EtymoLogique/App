// Audit d'accessibilité automatique (J8, App#31) : axe-core passe chaque
// écran de la PWA au crible, dans le navigateur simulé. Le contraste ne se
// calcule pas sous jsdom (aucune mise en page) : il se contrôle avec
// `check_identity` et à la main. Un écart nouveau fait échouer ce test.

import { readFileSync } from 'node:fs'

import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { ClientApi } from './services/api'
import { effacerPartie } from './services/local'
import { GEO, MOT, RECETTE, etat, lecteurFictif } from './test/fixtures'

const decouvertes = [{ mot_id: MOT, recette_id: RECETTE, numero: 1, decouverte_le: '2026-10-02T10:00:00Z' }]
const partie = etat({
  decouvertes,
  quetes_du_jour: [
    { rang: 0, sorte: 'table', code: 'table_sens', mot_id: MOT, cible: 1, progres: 0, faite: false },
    { rang: 1, sorte: 'memoire', code: 'memoire_sans_faute', cible: 5, progres: 2, faite: false },
  ],
  carte_de_lecteur: { tampons: ['2026-10-01', '2026-10-03'], taille: 7, a_recuperer: 0, remplies: 0, recompense: { gouttes: 20, sabliers: 1, plis: 1 } },
  cadeau_de_bienvenue: { plis: [GEO], sabliers: 12, encre: 40, recupere: false },
  quetes_initiales: [{ code: 'trois_mots', cible: 3, progres: 1, faite: false, recuperee: false, recompense: { plis_offerts: 2, plis_de_lecteur: 0, sabliers: 0, gouttes: 0 } }],
})

const ECRANS = ['table', 'codex', 'plis', 'quetes/journalieres', 'quetes/ponctuelles', 'quetes/fascicules', 'quetes/au-long-cours', 'boutique', 'ricochets', 'reglages']

async function violations(): Promise<string[]> {
  const resultat = await axe.run(document.body, {
    // Le contraste dépend de la mise en page, absente de jsdom.
    rules: { 'color-contrast': { enabled: false } },
  })
  return resultat.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`)
}

describe('accessibilité (axe)', () => {
  beforeEach(async () => {
    await effacerPartie()
  })

  it.each(ECRANS)('l’écran « %s » n’a aucune violation détectable', async (ecran) => {
    history.replaceState(null, '', `/#/${ecran}`)
    const api = new ClientApi('https://api.exemple.test')
    vi.spyOn(api, 'etat').mockResolvedValue(partie)
    vi.spyOn(api, 'sante').mockResolvedValue({ statut: 'ok', version_catalogue: 'v1', version_api: '0', revision_api: '', reinitialisation: false })
    render(<App api={api} catalogue={lecteurFictif()} />)
    await screen.findByRole('navigation', { name: 'Navigation principale' })
    // Laisse le catalogue et l'état se charger avant de mesurer.
    await new Promise((r) => setTimeout(r, 50))
    expect(await violations()).toEqual([])
  })

  it('la page statique des mentions légales n’a aucune violation détectable', async () => {
    document.documentElement.innerHTML = readFileSync('public/mentions-legales.html', 'utf8')
    expect(await violations()).toEqual([])
  })
})

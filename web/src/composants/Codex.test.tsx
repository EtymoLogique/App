import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Etat } from '../contrat'
import { construireCodex } from '../services/codex'
import { enquetesEnCours } from '../services/indices'
import { MOT, RECETTE, cartes, etat, jeu, manifeste } from '../test/fixtures'
import { Codex } from './Codex'

const UNITE_GEO = 'unt_0000ge00'
const lireMedia = () => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"/>')

function codex(indices: Etat['indices'], carte: string | null = null, nouvelles = new Set<string>(), onVue: (id: string) => void = () => {}) {
  const j = jeu()
  j.fascicules[0]!.manifeste = { ...manifeste, cartes: cartes.map((x) => ({ id: x.id, role: x.brique ? 'ingredient' : 'resultat', carte: 'r/x' })) }
  const e = etat({ indices })
  const entrees = construireCodex(j, e)
  return render(
    <Codex
      entrees={entrees}
      jeu={j}
      nouvelles={nouvelles}
      onVue={onVue}
      vue={{ vue: 'tout', filtre: 'tout', tri: 'n', inverse: false, fascicule: null, carte, plus: false }}
      onChangerVue={() => {}}
      urlMedia={(c) => c}
      lireMedia={lireMedia}
      enquetes={enquetesEnCours(j, entrees, e)}
    />,
  )
}

describe('Codex et indices', () => {
  it('une carte à trouver ne montre que les indices achetés, jamais le mot', () => {
    codex([{ recette_id: RECETTE, niveau: 2 }])
    expect(screen.getByRole('button', { name: /à découvrir, sens littéral « étude de la terre »/ })).toBeInTheDocument()
    expect(screen.queryByText(/géologie/)).not.toBeInTheDocument()
    expect(screen.queryByText('Science de la Terre.')).not.toBeInTheDocument()
  })

  it('la carte agrandie montre la définition achetée à la place du « ? » seul', () => {
    codex([{ recette_id: RECETTE, niveau: 3 }], MOT)
    expect(screen.getByText('Science de la Terre.')).toBeInTheDocument()
    expect(screen.queryByText(/étude de la terre/)).not.toBeInTheDocument()
    expect(screen.queryByText(/géologie/)).not.toBeInTheDocument()
  })

  it('sans indice, rien ne change', () => {
    codex([], MOT)
    expect(screen.getByText('Cette carte n’est pas encore découverte.')).toBeInTheDocument()
    expect(screen.queryByText(/étude de la terre/)).not.toBeInTheDocument()
  })
})

describe('Codex et nouveautés', () => {
  it('une carte nouvelle qui paraît à l’écran est vue sans être ouverte, et garde son halo', () => {
    // jsdom n'a pas IntersectionObserver : chaque carte observée paraît aussitôt.
    vi.stubGlobal('IntersectionObserver', class {
      rappel: IntersectionObserverCallback
      constructor(rappel: IntersectionObserverCallback) {
        this.rappel = rappel
      }
      observe(cible: Element) {
        this.rappel([{ target: cible, isIntersecting: true } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }
      disconnect() {}
    })
    const onVue = vi.fn()
    codex([], null, new Set([UNITE_GEO]), onVue)
    expect(onVue).toHaveBeenCalledWith(UNITE_GEO)
    expect(document.querySelector(`[data-carte="${UNITE_GEO}"]`)).toHaveClass('is-new')
  })
})

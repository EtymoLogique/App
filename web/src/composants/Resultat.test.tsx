import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GEO, LOGIE, MOT, RECETTE, jeu } from '../test/fixtures'
import { Resultat, type Retour } from './Resultat'

const JALON = 'jal_0000000a'
const retour: Retour = {
  etat: 'confirme',
  issue: { type: 'decouverte', mot_id: MOT, recette_id: RECETTE, numero: 1, gouttes: 3 } as never,
  jalons: [JALON],
}

function afficher(aRecuperer: string[]) {
  render(<Resultat retour={retour} jeu={jeu()} posees={0} bloquee={null} onInverser={() => {}} aRecuperer={new Set(aRecuperer)} onQuetes={() => {}} briquesPosees={[]} decouverts={new Set()} onCarte={() => {}} onRemplacer={() => {}} />)
}

describe('Resultat, jalon atteint', () => {
  it('propose la récompense tant qu’elle attend', () => {
    afficher([JALON])
    expect(screen.getByRole('button', { name: 'Récupérer la récompense' })).toBeInTheDocument()
  })

  it('retire le message une fois la récompense récupérée', () => {
    afficher([])
    expect(screen.queryByText(/Jalon atteint/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Récupérer la récompense' })).not.toBeInTheDocument()
  })
})

describe('Resultat, fusions trompeuses (ADR 0052)', () => {
  const PIEGE = 'tpl_0000000a'

  function afficherEchec(explication: unknown, options: { decouverts?: string[]; motId?: string | null; posees?: string[] } = {}) {
    const catalogue = jeu()
    catalogue.trompesLOeil.push({ id: PIEGE, combinaison: [GEO, LOGIE], motId: options.motId === undefined ? MOT : options.motId, courte: 'Le mot n’en vient pas.', complete: 'Il vient d’ailleurs.' })
    const onCarte = vi.fn()
    const onRemplacer = vi.fn()
    render(
      <Resultat
        retour={{ etat: 'confirme', issue: { type: 'echec', explication } as never }}
        jeu={catalogue}
        posees={2}
        bloquee={null}
        onInverser={() => {}}
        aRecuperer={new Set()}
        onQuetes={() => {}}
        briquesPosees={options.posees ?? [GEO, LOGIE]}
        decouverts={new Set(options.decouverts ?? [])}
        onCarte={onCarte}
        onRemplacer={onRemplacer}
      />,
    )
    return { catalogue, onCarte, onRemplacer }
  }

  it('dit « bonne forme, autre brique » et propose de remplacer la brique posée', () => {
    const { catalogue, onCarte, onRemplacer } = afficherEchec({ nature: 'homographe', rang: 0 })
    expect(screen.getByText('Bonne forme, autre brique.')).toBeInTheDocument()
    const geo = catalogue.briques.get(GEO)!
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Voir la carte`) }))
    expect(onCarte).toHaveBeenCalledWith(geo.uniteId)
    const [pastille, bouton] = screen.getAllByRole('button', { name: `Voir les briques ${geo.libelle}` })
    fireEvent.click(pastille!)
    fireEvent.click(bouton!)
    expect(onRemplacer).toHaveBeenCalledTimes(2)
    expect(onRemplacer).toHaveBeenCalledWith(0, geo.libelle)
  })

  it('ne nomme jamais la bonne brique', () => {
    afficherEchec({ nature: 'homographe', rang: 1 })
    expect(screen.queryByText(/vers/)).not.toBeInTheDocument()
  })

  it('affiche la fausse piste, ses briques cliquables et garde l’explication complète tant que le mot est inconnu', () => {
    afficherEchec({ nature: 'trompe_l_oeil', trompe_l_oeil_id: PIEGE })
    expect(screen.getByText('Fausse piste.')).toBeInTheDocument()
    expect(screen.getByText(/Le mot n’en vient pas\./)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Voir la carte/ })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Pourquoi/ })).not.toBeInTheDocument()
    expect(screen.getByText(/se lira une fois ce mot trouvé/)).toBeInTheDocument()
    expect(screen.queryByText('Il vient d’ailleurs.')).not.toBeInTheDocument()
  })

  it('ouvre « Pourquoi ? » quand le mot est au codex', () => {
    afficherEchec({ nature: 'trompe_l_oeil', trompe_l_oeil_id: PIEGE }, { decouverts: [MOT] })
    expect(screen.queryByText('Il vient d’ailleurs.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Pourquoi/ }))
    expect(screen.getByText('Il vient d’ailleurs.')).toBeInTheDocument()
  })

  it('lit l’explication complète tout de suite quand le piège ne vise aucun mot du jeu', () => {
    afficherEchec({ nature: 'trompe_l_oeil', trompe_l_oeil_id: PIEGE }, { motId: null })
    fireEvent.click(screen.getByRole('button', { name: /Pourquoi/ }))
    expect(screen.getByText('Il vient d’ailleurs.')).toBeInTheDocument()
  })

  it('retombe sur l’échec neutre sans explication connue', () => {
    afficherEchec({ nature: 'trompe_l_oeil', trompe_l_oeil_id: 'tpl_0000000z' })
    expect(screen.getByText(/Aucune recette connue/)).toBeInTheDocument()
  })
})

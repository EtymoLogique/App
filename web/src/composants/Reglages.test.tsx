import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Reglages } from './Reglages'

describe('Réglages : contact (RGPD art. 13)', () => {
  it('affiche une adresse de contact cliquable', () => {
    render(<Reglages reglages={{ theme: 'systeme', mouvement: 'systeme', retours: 'actifs' }} onChanger={() => {}} />)
    expect(screen.getByRole('link', { name: 'contact@etymologique.fr' })).toHaveAttribute('href', 'mailto:contact@etymologique.fr')
  })

  it('donne le code source, les textes des licences et les notices des dépendances', () => {
    render(<Reglages reglages={{ theme: 'systeme', mouvement: 'systeme', retours: 'actifs' }} onChanger={() => {}} />)
    expect(screen.getByRole('link', { name: 'Code source' })).toHaveAttribute('href', 'https://github.com/EtymoLogique/App')
    expect(screen.getByRole('link', { name: /AGPL 3\.0/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /CC BY-SA 4\.0/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Licences des dépendances' })).toHaveAttribute('href', '/licences-dependances.txt')
  })

  it('renvoie vers les réseaux sociaux du projet', () => {
    render(<Reglages reglages={{ theme: 'systeme', mouvement: 'systeme', retours: 'actifs' }} onChanger={() => {}} />)
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/etymologique_fr/')
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute('href', 'https://x.com/etymologique_fr')
  })
})

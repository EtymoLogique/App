import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Reglages } from './Reglages'

describe('Réglages : contact (RGPD art. 13)', () => {
  it('affiche une adresse de contact cliquable', () => {
    render(<Reglages reglages={{ theme: 'systeme', mouvement: 'systeme', retours: 'actifs' }} onChanger={() => {}} />)
    expect(screen.getByRole('link', { name: 'contact@etymologique.fr' })).toHaveAttribute('href', 'mailto:contact@etymologique.fr')
  })
})

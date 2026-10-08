import { describe, expect, it } from 'vitest'

import { energieDepuisReste } from './animation'
import { avantPlein, energieA } from './plis'

describe('energieDepuisReste', () => {
  const energie = { charges: 0, capacite: 2, prochaine_charge: '2026-10-01T12:00:00Z', recharge_s: 43_200 }
  const maintenant = Date.parse('2026-10-01T10:00:00Z')

  it('retrouve l’énergie d’origine à partir de son temps restant', () => {
    const reste = avantPlein(energie, maintenant)
    expect(energieA(energieDepuisReste(energie, reste, maintenant), maintenant)).toEqual(energieA(energie, maintenant))
  })

  it('passe une charge quand le temps restant descend sous une recharge', () => {
    const uneHeure = 3_600_000
    expect(energieA(energieDepuisReste(energie, uneHeure, maintenant), maintenant)).toEqual({ charges: 1, prochaine: maintenant + uneHeure })
    expect(energieA(energieDepuisReste(energie, 0, maintenant), maintenant)).toEqual({ charges: 2, prochaine: null })
  })
})

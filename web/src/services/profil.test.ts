import { describe, expect, it } from 'vitest'

import { base64url, nouveauProfil, profilLocal } from './profil'

describe('profil invité', () => {
  it('génère un secret de 256 bits en base64url et un UUID v4', () => {
    const profil = nouveauProfil()
    expect(profil.secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(profil.installation).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(nouveauProfil().secret).not.toBe(profil.secret)
  })

  it('encode en base64url sans remplissage', () => {
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
  })

  it('garde le même profil d’un lancement à l’autre', async () => {
    const premier = await profilLocal()
    const second = await profilLocal()
    expect(second).toEqual(premier)
  })
})

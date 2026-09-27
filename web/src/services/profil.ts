// Profil invité (ADR 0007, ADR 0024) : un identifiant d'installation et un
// secret de 256 bits, générés une fois et gardés dans IndexedDB. Aucune donnée
// personnelle. Le secret ne quitte l'appareil que vers l'API, en HTTPS.

import { createStore, get, set, type UseStore } from 'idb-keyval'

import type { DemandeSession } from '../contrat'

const CLE = 'profil-invite'

let magasin: UseStore | undefined
function stockage(): UseStore {
  magasin ??= createStore('etymologique', 'profil')
  return magasin
}

export function base64url(octets: Uint8Array): string {
  let binaire = ''
  for (const octet of octets) binaire += String.fromCharCode(octet)
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function nouveauProfil(): DemandeSession {
  const secret = new Uint8Array(32)
  crypto.getRandomValues(secret)
  return { installation: crypto.randomUUID(), secret: base64url(secret) }
}

function estProfil(valeur: unknown): valeur is DemandeSession {
  if (typeof valeur !== 'object' || valeur === null) return false
  const { installation, secret } = valeur as Record<string, unknown>
  return typeof installation === 'string' && typeof secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(secret)
}

/** Renvoie le profil de cette installation, en le créant au premier lancement. */
export async function profilLocal(): Promise<DemandeSession> {
  const existant: unknown = await get(CLE, stockage())
  if (estProfil(existant)) return existant
  const profil = nouveauProfil()
  await set(CLE, profil, stockage())
  return profil
}

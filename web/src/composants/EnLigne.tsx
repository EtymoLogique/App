import { useEnLigne } from '../services/reseau'

/** Indique l'état du réseau : hors connexion, la table se prépare mais rien ne se valide (ADR 0001). */
export function EnLigne() {
  const enLigne = useEnLigne()
  return (
    <span className={enLigne ? 'pastille' : 'pastille hors-ligne'} role="status">
      {enLigne ? 'En ligne' : 'Hors connexion'}
    </span>
  )
}

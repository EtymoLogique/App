import { depuis, useMaintenant } from '../services/horloge'
import { useReseau } from '../services/reseau'
import { Icone } from './Icone'

/**
 * Pastille de l'état du réseau dans l'en-tête d'un écran (ADR 0085) : une icône
 * et un mot, jamais la couleur seule. Rien en ligne, sauf « De retour en ligne »
 * pendant 2 s ; hors ligne, depuis quand la partie est à jour.
 */
export function PastilleReseau({ synchroniseLe }: { synchroniseLe: number | null }) {
  const { niveau, retour } = useReseau()
  const maintenant = useMaintenant()
  const visible = niveau !== 'en_ligne' || retour
  let contenu: React.ReactNode = null
  if (niveau === 'hors_ligne') {
    contenu = (
      <>
        <Icone nom="horsLigne" />
        <span>Hors ligne</span>
        {synchroniseLe !== null && <span className="pastille-detail"> · à jour {depuis(synchroniseLe, maintenant)}</span>}
      </>
    )
  } else if (retour) {
    contenu = (
      <>
        <Icone nom="reseau" />
        <span>De retour en ligne</span>
      </>
    )
  } else if (niveau === 'instable') {
    contenu = (
      <>
        <Icone nom="reseauFaible" />
        <span>Réseau instable</span>
      </>
    )
  }
  const titre =
    niveau === 'hors_ligne'
      ? 'Hors ligne : consultez votre codex et préparez votre table. La fusion, les plis et la boutique attendent le réseau.'
      : niveau === 'instable'
        ? 'Réseau instable : vos actions peuvent prendre un peu plus de temps. Rien n’est perdu.'
        : undefined
  // La région reste dans la page : les lecteurs d'écran annoncent ce qui y change.
  return (
    <p className="pastille-reseau" data-niveau={visible ? (retour && niveau !== 'hors_ligne' ? 'retour' : niveau) : undefined} role="status" title={titre}>
      {contenu}
    </p>
  )
}

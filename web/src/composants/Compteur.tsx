import { useValeurAnimee } from '../services/animation'

/** Nombre qui défile jusqu'à sa nouvelle valeur (gouttes, sabliers) ; 0 tant qu'il est inconnu, sans défiler au chargement. */
export function Compteur({ valeur }: { valeur: number | undefined }) {
  const affichee = useValeurAnimee(valeur ?? Number.NaN)
  return <>{Number.isNaN(affichee) ? 0 : Math.round(affichee)}</>
}

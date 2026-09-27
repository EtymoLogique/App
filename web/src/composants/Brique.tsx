import type { BriqueJeu } from '../services/jeu'

const NATURES: Record<BriqueJeu['nature'], string> = { prefixe: 'préfixe', suffixe: 'suffixe', mot: 'mot' }

interface Props {
  brique: BriqueJeu
  /** Exemplaires disponibles, affichés en pastille « ×n ». */
  disponibles?: number
  epuisee?: boolean
  /** Tous les exemplaires sont déjà posés sur la table. */
  tousPoses?: boolean
  compacte?: boolean
}

/**
 * Une brique n'est jamais affichée en texte brut (game-design) : sa couleur
 * dit sa nature, vert clair pour un préfixe, turquoise pour un suffixe.
 */
export function Brique({ brique, disponibles, epuisee = false, tousPoses = false, compacte = false }: Props) {
  const classes = ['brique', `brique-${brique.nature}`]
  if (epuisee) classes.push('epuisee')
  else if (tousPoses) classes.push('tous-poses')
  if (compacte) classes.push('compacte')
  return (
    <span className={classes.join(' ')}>
      <span className="sr-only">{NATURES[brique.nature]} </span>
      <span className="brique-forme" lang="fr">
        {brique.forme}
      </span>
      {!compacte && brique.glose && <span className="brique-glose">{brique.glose}</span>}
      {epuisee ? (
        <span className="brique-pastille">Épuisée</span>
      ) : (
        disponibles !== undefined && (
          <span className="brique-pastille" aria-label={`${disponibles} exemplaire${disponibles > 1 ? 's' : ''}`}>
            ×{disponibles}
          </span>
        )
      )}
    </span>
  )
}

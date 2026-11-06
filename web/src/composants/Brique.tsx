import { type BriqueJeu, NATURES, nomAccessible } from '../services/jeu'

/** Libellé serif, puis type et sens en mono capitales (design système 3.1). */
export function ContenuBrique({ brique }: { brique: BriqueJeu }) {
  return (
    <>
      <span className="b-label" lang="fr">
        {brique.libelle}
      </span>
      <span className="b-meta">
        <span className="b-kind">{NATURES[brique.nature]}</span>
        {brique.glose && <> · «&nbsp;{brique.glose}&nbsp;»</>}
      </span>
    </>
  )
}

interface Props {
  brique: BriqueJeu
  /** `m` : table et réserve ; `s` : équation compacte. */
  taille?: 'm' | 's'
  /** Classe en plus, par exemple la brique révélée d'un pli. */
  className?: string
}

/**
 * Une brique n'est jamais affichée en texte brut (game-design) : sa couleur
 * dit sa nature, Étincelle pour un préfixe, Glose pour un suffixe.
 */
export function Brique({ brique, taille = 'm', className }: Props) {
  return (
    <span className={['brick', taille === 's' ? 's' : '', className ?? ''].filter(Boolean).join(' ')} data-kind={NATURES[brique.nature]}>
      <ContenuBrique brique={brique} />
    </span>
  )
}

/** Petite brique, dans une phrase. */
export function PetiteBrique({ brique }: { brique: BriqueJeu }) {
  return (
    <span className="bchip" data-kind={NATURES[brique.nature]} title={nomAccessible(brique)}>
      {brique.libelle}
    </span>
  )
}

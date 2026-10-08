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

/**
 * Petite brique, dans une phrase. Avec `onOuvrir`, c'est un bouton (zone tactile de 44 px
 * au moins) qui ouvre la carte de la brique, comme dans les retours de la table (ADR 0052).
 */
export function PetiteBrique({ brique, onOuvrir, titre }: { brique: BriqueJeu; onOuvrir?: () => void; titre?: string }) {
  if (onOuvrir) {
    return (
      <button type="button" className="bchip bchip-btn" data-kind={NATURES[brique.nature]} title={titre ?? nomAccessible(brique)} aria-label={titre ?? `Voir la carte : ${nomAccessible(brique)}`} onClick={onOuvrir}>
        {brique.libelle}
      </button>
    )
  }
  return (
    <span className="bchip" data-kind={NATURES[brique.nature]} title={nomAccessible(brique)}>
      {brique.libelle}
    </span>
  )
}

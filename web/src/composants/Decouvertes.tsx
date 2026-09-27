import type { Decouverte } from '../contrat'
import type { CatalogueJeu } from '../services/jeu'
import { texteDuMot } from '../services/jeu'

interface Props {
  decouvertes: Decouverte[]
  jeu: CatalogueJeu
  onOuvrirFiche: (motId: string) => void
}

export function Decouvertes({ decouvertes, jeu, onOuvrirFiche }: Props) {
  // Compteurs des manifestes : hors légendaires, qui ne se trahissent jamais (ADR 0015).
  const total = jeu.fascicules.reduce((n, f) => {
    const mots = (f.manifeste.compteurs as { mots?: unknown } | undefined)?.mots
    return n + (typeof mots === 'number' ? mots : 0)
  }, 0)
  return (
    <>
      <p className="meta">
        {decouvertes.length} mot{decouvertes.length > 1 ? 's' : ''} découvert{decouvertes.length > 1 ? 's' : ''} sur {total}
      </p>
      {decouvertes.length > 0 && (
        <ol className="decouvertes">
          {decouvertes.map((d) => (
            <li key={d.mot_id}>
              <button type="button" className="lien" onClick={() => onOuvrirFiche(d.mot_id)}>
                {texteDuMot(jeu.cartes.get(d.mot_id))}
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

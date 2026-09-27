import type { Decouverte } from '../contrat'
import type { CatalogueJeu } from '../services/jeu'
import { definition, texteDuMot } from '../services/jeu'

interface Props {
  decouvertes: Decouverte[]
  jeu: CatalogueJeu
  total: number
  onOuvrirFiche: (motId: string) => void
}

/** Découvertes : barre de progression Encre, mots trouvés, cases en pointillé pour ce qui manque. */
export function Decouvertes({ decouvertes, jeu, total, onOuvrirFiche }: Props) {
  const manquants = Math.max(total - decouvertes.length, 0)
  const part = total > 0 ? Math.min(decouvertes.length / total, 1) : 0
  return (
    <section className="discoveries" aria-labelledby="titre-decouvertes">
      <div className="disc-head">
        <h2 id="titre-decouvertes">Découvertes</h2>
        <span>
          {decouvertes.length} / {total}
        </span>
      </div>
      <div
        className="disc-bar"
        role="progressbar"
        aria-label="Mots découverts"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={decouvertes.length}
      >
        <i style={{ width: `${part * 100}%` }} />
      </div>
      <ul className="disc-grid">
        {decouvertes.map((d) => {
          const carte = jeu.cartes.get(d.mot_id)
          return (
            <li key={d.mot_id}>
              <button type="button" className="disc found" onClick={() => onOuvrirFiche(d.mot_id)}>
                <span className="d-word">{texteDuMot(carte)}</span>
                {carte && definition(carte) && <span className="d-def">{definition(carte)}</span>}
              </button>
            </li>
          )
        })}
        {Array.from({ length: manquants }, (_, i) => (
          <li key={`manquant-${i}`}>
            <span className="disc" aria-label="Mot à découvrir">
              <span className="d-word">?</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

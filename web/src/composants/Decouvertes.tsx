import type { EntreeCodex } from '../services/codex'
import { NATURES } from '../services/jeu'

interface Props {
  /** Mots du codex, sans légendaire inconnue ni mot qui en dépend. */
  mots: EntreeCodex[]
  onOuvrirFiche: (motId: string) => void
  onCodex: () => void
}

/**
 * Découvertes, sous la table (jeu.html) : barre de progression Encre, mots
 * trouvés avec leur formule en petites briques, mots à trouver en silhouette.
 */
export function Decouvertes({ mots, onOuvrirFiche, onCodex }: Props) {
  const trouves = mots.filter((m) => m.trouvee).length
  const part = mots.length > 0 ? trouves / mots.length : 0
  return (
    <section className="discoveries" aria-labelledby="titre-decouvertes">
      <div className="disc-head">
        <h2 id="titre-decouvertes">Découvertes</h2>
        <span>
          {trouves} / {mots.length}
        </span>
      </div>
      <div className="disc-bar" role="progressbar" aria-label="Mots découverts" aria-valuemin={0} aria-valuemax={mots.length} aria-valuenow={trouves}>
        <i style={{ width: `${part * 100}%` }} />
      </div>
      <ul className="disc-grid">
        {mots.map((m) => {
          const lettres = Array.from(m.libelle).length
          return (
            <li key={m.id}>
              {m.trouvee ? (
                <button type="button" className="disc found" aria-label={`${m.libelle} : ${m.definition ?? ''} Revoir la fiche`} onClick={() => onOuvrirFiche(m.id)}>
                  <span className="d-word">{m.libelle}</span>
                  {m.liens && (
                    <span className="d-formula">
                      <span className="bformula">
                        {m.liens.items.map((l, i) => (
                          <span key={i} className="bformula">
                            {i > 0 && <span className="bplus">+</span>}
                            <span className="bchip" data-kind={NATURES[l.nature]}>
                              {l.libelle}
                            </span>
                          </span>
                        ))}
                      </span>
                    </span>
                  )}
                </button>
              ) : (
                <div className="disc" aria-label={`Mot à découvrir, ${lettres} lettres`}>
                  <span className="d-word" aria-hidden="true">
                    {'•'.repeat(lettres)}
                  </span>
                  <span className="d-formula" aria-hidden="true">
                    {lettres} lettres
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="panel-tip">
        <button type="button" className="xref" onClick={onCodex}>
          Toutes les cartes du codex
        </button>
      </p>
    </section>
  )
}

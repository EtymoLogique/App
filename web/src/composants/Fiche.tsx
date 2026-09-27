import { useEffect, useRef } from 'react'

import type { Carte, Exemplaires } from '../contrat'
import type { CatalogueJeu } from '../services/jeu'
import { definition, texteDuMot } from '../services/jeu'
import { Brique } from './Brique'

interface Props {
  motId: string
  jeu: CatalogueJeu
  reserve: Exemplaires[]
  /** Briques consommées par la découverte qui vient d'avoir lieu. */
  consommees?: string[]
  onFermer: () => void
}

function compositionPreferee(carte: Carte) {
  const compositions = carte.compositions ?? []
  return compositions.find((c) => c.preferee) ?? compositions[0]
}

/**
 * Fiche de découverte : le mot, son sens, sa composition en briques et son
 * explication courte, sans casser le rythme (game-design, « Transmission »).
 */
export function Fiche({ motId, jeu, reserve, consommees, onFermer }: Props) {
  const fermer = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    fermer.current?.focus()
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer])

  const carte = jeu.cartes.get(motId)
  if (!carte) return null
  const mot = texteDuMot(carte)
  const composition = compositionPreferee(carte)
  const libelles = composition?.libelles.fr
  const parties = [...(composition?.parties ?? [])].sort((a, b) => a.rang - b.rang)
  const transformations = [...(composition?.transformations ?? [])].sort((a, b) => a.ordre - b.ordre)
  const briqueDe = (uniteId: string) => [...jeu.briques.values()].find((b) => b.uniteId === uniteId)
  const langue = jeu.langues.get(carte.langue_id)

  return (
    <div className="voile" onClick={onFermer}>
      <section
        className="fiche"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fiche-titre"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={fermer} type="button" className="fiche-fermer" onClick={onFermer} aria-label="Fermer la fiche">
          ×
        </button>
        <h2 id="fiche-titre">{mot}</h2>
        {langue && <p className="meta">{langue}</p>}
        {definition(carte) && <p>{definition(carte)}</p>}

        {parties.length > 0 && (
          <p className="composition" aria-label="Composition">
            {parties.map((partie, i) => {
              const brique = briqueDe(partie.unite_id)
              return (
                <span key={partie.rang}>
                  {i > 0 && <span className="plus"> + </span>}
                  {brique ? <Brique brique={brique} compacte /> : texteDuMot(jeu.cartes.get(partie.unite_id))}
                </span>
              )
            })}
          </p>
        )}
        {libelles?.sens_litteral && (
          <p>
            Sens littéral : <em>{libelles.sens_litteral}</em>
          </p>
        )}
        {libelles?.explication_courte && <p>{libelles.explication_courte}</p>}
        {transformations.map((t) => (
          <p key={t.id} className="transformation">
            {t.libelles.fr?.texte}
          </p>
        ))}

        {consommees && consommees.length > 0 && (
          <div className="consommes">
            <h3>Exemplaires utilisés</h3>
            <ul>
              {consommees.map((id) => {
                const brique = jeu.briques.get(id)
                const restants = reserve.find((e) => e.brique_id === id)?.exemplaires ?? 0
                return brique ? (
                  <li key={id}>
                    <Brique brique={brique} compacte /> <span className="moins">−1</span> · il en reste {restants}
                  </li>
                ) : null
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

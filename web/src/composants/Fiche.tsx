import { Fragment, useEffect, useRef } from 'react'

import type { Carte, Exemplaires } from '../contrat'
import type { CatalogueJeu } from '../services/jeu'
import { NATURES, definition, texteDuMot } from '../services/jeu'
import { Brique, PetiteBrique } from './Brique'
import { MotSegmente } from './MotSegmente'

interface Props {
  motId: string
  jeu: CatalogueJeu
  reserve: Exemplaires[]
  /** Rang de la découverte et nombre de mots des fascicules parus. */
  numero?: number
  total: number
  /** Briques consommées par la découverte qui vient d'avoir lieu. */
  consommees?: string[]
  onFermer: () => void
  /** Mène aux plis, mis en avant quand une brique utilisée est épuisée. */
  onPlis: () => void
  /** Ouvre la carte du mot dans le codex. */
  onCodex: () => void
}

function compositionPreferee(carte: Carte) {
  const compositions = carte.compositions ?? []
  return compositions.find((c) => c.preferee) ?? compositions[0]
}

/**
 * Fiche de découverte (design système 3.4) : le mot, sa définition, son
 * équation en briques, son sens littéral, puis, plus discrets, son origine,
 * ses transformations et les exemplaires utilisés. Un seul bouton : Continuer.
 * Elle s'affiche au-dessus de la table, qui reste visible (jeu.html, I-11).
 */
export function Fiche({ motId, jeu, reserve, numero, total, consommees, onFermer, onPlis, onCodex }: Props) {
  const continuer = useRef<HTMLButtonElement>(null)
  useEffect(() => {
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
  const morceaux = parties.flatMap((p) => {
    const nature = jeu.cartes.get(p.unite_id)?.nature
    return p.segment_debut != null && p.segment_fin != null && nature ? [{ debut: p.segment_debut, fin: p.segment_fin, nature }] : []
  })
  const nouvelle = consommees !== undefined
  const epuisees = (consommees ?? []).some((id) => (reserve.find((e) => e.brique_id === id)?.exemplaires ?? 0) === 0)

  return (
    <article className="result" aria-labelledby="fiche-titre">
        <p className="r-kicker" role="status">
          {nouvelle && numero ? `Découverte ${numero} / ${total}` : 'Déjà dans le codex'}
        </p>
        <h2 id="fiche-titre" className="r-word" aria-label={mot}>
          <MotSegmente mot={mot} morceaux={morceaux} />
        </h2>
        {definition(carte) && <p className="r-def">{definition(carte)}</p>}

        {parties.length > 0 && (
          <p className="r-eq" aria-label="Composition">
            {parties.map((partie, i) => {
              const brique = briqueDe(partie.unite_id)
              return (
                <Fragment key={partie.rang}>
                  {i > 0 && (
                    <span className="r-op" aria-hidden="true">
                      +
                    </span>
                  )}
                  {brique ? <Brique brique={brique} taille="s" /> : texteDuMot(jeu.cartes.get(partie.unite_id))}
                </Fragment>
              )
            })}
          </p>
        )}
        {libelles?.sens_litteral && (
          <p className="r-lit">
            <span>Sens littéral</span>«&nbsp;{libelles.sens_litteral}&nbsp;»
          </p>
        )}
        {libelles?.explication_courte && <p className="r-note">{libelles.explication_courte}</p>}
        {transformations.map((t) => (
          <p key={t.id} className="r-tr">
            {t.libelles.fr?.texte}
          </p>
        ))}

        {nouvelle && consommees.length > 0 && (
          <ul className="r-cost" aria-label="Exemplaires utilisés">
            <li className="r-cost-titre" aria-hidden="true">
              Exemplaires utilisés
            </li>
            {consommees.map((id) => {
              const brique = jeu.briques.get(id)
              const restants = reserve.find((e) => e.brique_id === id)?.exemplaires ?? 0
              return brique ? (
                <li key={id} aria-label={`${NATURES[brique.nature]} ${brique.libelle} : −1, ${restants === 0 ? 'épuisée' : `reste ${restants}`}`}>
                  <PetiteBrique brique={brique} /> <small>{restants === 0 ? '−1 · épuisée' : `−1 · reste ×${restants}`}</small>
                </li>
              ) : null
            })}
          </ul>
        )}
        {epuisees && (
          <button type="button" className="btn-texte" onClick={onPlis}>
            Ouvrir un pli pour retrouver des exemplaires
          </button>
        )}
        <div className="r-links">
          <button type="button" className="xref" onClick={onCodex}>
            Voir la carte dans le codex
          </button>
        </div>
        <button ref={continuer} type="button" className="btn btn-secondary" onClick={onFermer}>
          Continuer
        </button>
    </article>
  )
}

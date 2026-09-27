import { Fragment, useEffect, useRef } from 'react'

import type { Carte, Exemplaires } from '../contrat'
import type { BriqueJeu, CatalogueJeu } from '../services/jeu'
import { NATURES, definition, texteDuMot } from '../services/jeu'
import { Brique, PetiteBrique } from './Brique'

const SEGMENTS: Record<BriqueJeu['nature'], string> = {
  prefixe: 'var(--c-prefix)',
  suffixe: 'var(--c-suffix)',
  mot: 'var(--paper-2)',
}

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
}

function compositionPreferee(carte: Carte) {
  const compositions = carte.compositions ?? []
  return compositions.find((c) => c.preferee) ?? compositions[0]
}

/** Mot surligné par morceaux, aux couleurs de ses briques, si les segments le couvrent exactement. */
function MotSegmente({ mot, morceaux }: { mot: string; morceaux: { debut: number; fin: number; nature: BriqueJeu['nature'] }[] }) {
  const lettres = Array.from(mot)
  const couvre = morceaux.length > 0 && morceaux.every((m, i) => m.debut === (i === 0 ? 0 : morceaux[i - 1]?.fin) && m.fin > m.debut)
  if (!couvre || morceaux[morceaux.length - 1]?.fin !== lettres.length) return <>{mot}</>
  return (
    <>
      {morceaux.map((m) => (
        <span key={m.debut} className="seg" style={{ '--c': SEGMENTS[m.nature] } as React.CSSProperties}>
          {lettres.slice(m.debut, m.fin).join('')}
        </span>
      ))}
    </>
  )
}

/**
 * Fiche de découverte (design système 3.4) : le mot, sa définition, son
 * équation en briques, son sens littéral, puis, plus discrets, son origine,
 * ses transformations et les exemplaires utilisés. Un seul bouton : Continuer.
 */
export function Fiche({ motId, jeu, reserve, numero, total, consommees, onFermer, onPlis }: Props) {
  const continuer = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    continuer.current?.focus()
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
    <div className="voile" onClick={onFermer}>
      <section className="result" role="dialog" aria-modal="true" aria-labelledby="fiche-titre" onClick={(e) => e.stopPropagation()}>
        <p className="r-kicker">
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
                  <PetiteBrique brique={brique} /> −1 <small>{restants === 0 ? 'épuisée' : `reste ×${restants}`}</small>
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
        <button ref={continuer} type="button" className="btn btn-secondary" onClick={onFermer}>
          Continuer
        </button>
      </section>
    </div>
  )
}

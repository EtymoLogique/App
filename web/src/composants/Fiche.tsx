import { Fragment, useEffect, useRef } from 'react'

import type { Exemplaires } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import type { CatalogueJeu } from '../services/jeu'
import { NATURES, definition, formeCanonique, texteDuMot } from '../services/jeu'
import { Brique, PetiteBrique } from './Brique'
import { MotSegmente } from './MotSegmente'

interface Props {
  motId: string
  jeu: CatalogueJeu
  entree: EntreeCodex | undefined
  reserve: Exemplaires[]
  /** Briques consommées par la découverte qui vient d'avoir lieu. */
  consommees?: string[]
  onFermer: () => void
  /** Ouvre la carte du mot dans le codex. */
  onCodex: () => void
}

/**
 * Révélation et fiche de découverte (maquette I-11), en trois temps : le mot,
 * sa composition, puis les pistes ouvertes. Dialogue centré sur ordinateur,
 * plein écran sur mobile. Échap ou « Continuer » la ferme.
 */
export function Fiche({ motId, jeu, entree, reserve, consommees, onFermer, onCodex }: Props) {
  const continuer = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    continuer.current?.focus({ preventScroll: true })
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer])

  const carte = jeu.cartes.get(motId)
  if (!carte) return null
  const mot = texteDuMot(carte)
  const composition = (carte.compositions ?? []).find((c) => c.preferee) ?? carte.compositions?.[0]
  const libelles = composition?.libelles.fr
  const parties = [...(composition?.parties ?? [])].sort((a, b) => a.rang - b.rang)
  const transformations = [...(composition?.transformations ?? [])].sort((a, b) => a.ordre - b.ordre)
  const briqueDe = (uniteId: string) => [...jeu.briques.values()].find((b) => b.uniteId === uniteId)
  const morceaux = parties.flatMap((p) => {
    const nature = jeu.cartes.get(p.unite_id)?.nature
    return p.segment_debut != null && p.segment_fin != null && nature ? [{ debut: p.segment_debut, fin: p.segment_fin, nature }] : []
  })
  const langue = jeu.langues.get(carte.langue_id)
  const nouvelle = consommees !== undefined
  // Pistes ouvertes : un mot qui se pose lui-même comme brique rejoint le catalogue des plis.
  const pistes = carte.brique ? [`Nouvelle brique au catalogue des plis : ${formeCanonique(carte)?.texte ?? mot}`] : []
  const numero = entree ? `N°\u00a0${String(entree.n).padStart(3, '0')}` : ''

  return (
    <div className="scrim" onClick={onFermer}>
      <section className="dialogue fiche" role="dialog" aria-modal="true" aria-labelledby="fiche-titre" onClick={(e) => e.stopPropagation()}>
        <p className="r-kicker">{nouvelle ? `Nouvelle découverte · ${numero}` : `Déjà dans le codex · ${numero}`}</p>

        <div className="fiche-temps fiche-temps-1">
          <p className="fiche-etape">1 · Le mot</p>
          <h2 id="fiche-titre" className="r-word" aria-label={mot}>
            <MotSegmente mot={mot} morceaux={morceaux} />
          </h2>
          {definition(carte) && <p className="r-def">{definition(carte)}</p>}
          {langue && (
            <p className="fiche-langue">
              <i aria-hidden="true" />
              {langue}
            </p>
          )}
        </div>

        {parties.length > 0 && (
          <div className="fiche-temps fiche-temps-2">
            <p className="fiche-etape">2 · La composition</p>
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
          </div>
        )}

        {nouvelle && (
          <div className="fiche-temps fiche-temps-3">
            <p className="fiche-etape">3 · Les pistes</p>
            {pistes.length > 0 && (
              <p className="rangee">
                {pistes.map((p) => (
                  <span key={p} className="recompense">
                    {p}
                  </span>
                ))}
              </p>
            )}
            {consommees.length > 0 && (
              <ul className="r-cost" aria-label="Exemplaires utilisés">
                {consommees.map((id) => {
                  const brique = jeu.briques.get(id)
                  const restants = reserve.find((e) => e.brique_id === id)?.exemplaires ?? 0
                  return brique ? (
                    <li key={id} aria-label={`${NATURES[brique.nature]} ${brique.libelle} : −1, ${restants === 0 ? 'épuisée' : `reste ${restants}`}`}>
                      <PetiteBrique brique={brique} /> <span className="moins">−1</span>{' '}
                      <small>{restants === 0 ? 'épuisée · revient par les plis' : `reste ×${restants}`}</small>
                    </li>
                  ) : null
                })}
              </ul>
            )}
          </div>
        )}

        <div className="rangee rangee-fin">
          <button type="button" className="btn-texte" onClick={onCodex}>
            En savoir plus
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCodex}>
            Voir au codex
          </button>
          <button ref={continuer} type="button" className="btn btn-primary" onClick={onFermer}>
            Continuer
          </button>
        </div>
      </section>
    </div>
  )
}

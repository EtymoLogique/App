import { Fragment, useEffect, useRef, useState } from 'react'

import type { Exemplaires } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import type { CatalogueJeu } from '../services/jeu'
import { NATURES, definition, formeCanonique, rareteMot, texteDuMot } from '../services/jeu'
import { LIBELLES_RARETES } from '../services/plis'
import { Brique, PetiteBrique } from './Brique'
import { MotSegmente } from './MotSegmente'
import { FormeRarete } from './Rarete'
import { Sablier } from './Sabliers'

interface Props {
  motId: string
  jeu: CatalogueJeu
  entree: EntreeCodex | undefined
  reserve: Exemplaires[]
  /** Briques consommées par la découverte qui vient d'avoir lieu. */
  consommees?: string[]
  /** Jalons atteints par cette découverte : leur récompense est déjà dans la réserve. */
  jalons?: string[]
  /** Gouttes d'encre gagnées par cette découverte (ADR 0040). */
  gouttes?: number
  onFermer: () => void
  /** Ouvre la carte du mot dans le codex. */
  onCodex: () => void
}

/**
 * Révélation et fiche de découverte (maquette I-11), en trois temps : le mot,
 * sa composition, puis les pistes ouvertes. Dialogue centré sur ordinateur,
 * plein écran sur mobile. Échap ou « Continuer » la ferme.
 */
export function Fiche({ motId, jeu, entree, reserve, consommees, jalons = [], gouttes = 0, onFermer, onCodex }: Props) {
  const continuer = useRef<HTMLButtonElement>(null)
  const dialogue = useRef<HTMLElement>(null)
  const voile = useRef<HTMLDivElement>(null)
  const [enVol, setEnVol] = useState(false)

  /**
   * « Continuer » après une nouvelle découverte : la carte se réduit et vole
   * jusqu'à l'onglet Codex, qui la reçoit d'un petit rebond (FLIP, 620 ms,
   * comme le « Vol de carte » de mouvement.html). Sans mouvement, elle se ferme.
   */
  const rangerAuCodex = async () => {
    const carte = dialogue.current
    const cible = document.querySelector<HTMLElement>('.navigation [data-onglet="codex"]')
    const reduit =
      document.documentElement.dataset.mouvement === 'reduit' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    if (!carte || !cible || reduit || typeof carte.animate !== 'function') {
      onFermer()
      return
    }
    setEnVol(true)
    const depart = carte.getBoundingClientRect()
    const arrivee = cible.getBoundingClientRect()
    const dx = arrivee.left + arrivee.width / 2 - (depart.left + depart.width / 2)
    const dy = arrivee.top + arrivee.height / 2 - (depart.top + depart.height / 2)
    const echelle = Math.max(0.04, Math.min(arrivee.width / depart.width, arrivee.height / depart.height))
    voile.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' })
    const vol = carte.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: 'scale(0.55) rotate(-4deg)', opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy}px) scale(${echelle}) rotate(-8deg)`, opacity: 0.2 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.08)', fill: 'forwards' },
    )
    await vol.finished.catch(() => undefined)
    cible.animate(
      [{ transform: 'none' }, { transform: 'scale(1.18)' }, { transform: 'none' }],
      { duration: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    )
    onFermer()
  }
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
  // L'intensité de la révélation grandit avec la rareté du mot, comme pour un pli (ADR 0040).
  const rarete = rareteMot(motId, jeu)
  const annonce = rarete === 'legendaire' ? 'Légendaire\u00a0!' : rarete === 'rare' ? 'Rare\u00a0!' : 'Nouvelle découverte'

  return (
    <div className={enVol ? 'scrim en-vol' : 'scrim'} onClick={() => !enVol && onFermer()}>
      <div ref={voile} className="scrim-fond" aria-hidden="true" />
      <section ref={dialogue} className="dialogue fiche" data-rarity={nouvelle ? rarete : undefined} role="dialog" aria-modal="true" aria-labelledby="fiche-titre" onClick={(e) => e.stopPropagation()}>
        <p className="r-kicker">{nouvelle ? `${annonce} · ${numero}` : `Déjà dans le codex · ${numero}`}</p>

        <div className="fiche-temps fiche-temps-1">
          <p className="fiche-etape">1 · Le mot</p>
          <h2 id="fiche-titre" className="r-word" aria-label={mot}>
            <MotSegmente mot={mot} morceaux={morceaux} />
          </h2>
          {definition(carte) && <p className="r-def">{definition(carte)}</p>}
          <p className="fiche-rarete">
            <FormeRarete rarete={rarete} />
            {LIBELLES_RARETES[rarete]}
            {nouvelle && gouttes > 0 && <span className="fiche-encre">+{gouttes}&nbsp;goutte{gouttes > 1 ? 's' : ''} d’encre</span>}
          </p>
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

        {jalons.length > 0 && (
          <div className="fiche-temps fiche-jalon" role="status">
            <p className="fiche-etape">Jalon atteint</p>
            {jeu.fascicules
              .flatMap((f) => f.manifeste.jalons ?? [])
              .filter((j) => jalons.includes(j.id))
              .map((j) => (
                <p key={j.id} className="rangee">
                  <span>
                    {j.decouvertes} découverte{j.decouvertes > 1 ? 's' : ''}&nbsp;: pli de jalon reçu
                  </span>
                  {(j.pli ?? []).map((id) => {
                    const b = jeu.briques.get(id)
                    return b ? <PetiteBrique key={id} brique={b} /> : null
                  })}
                  {(j.sabliers ?? 0) > 0 && (
                    <span className="recompense">
                      <Sablier /> +{j.sabliers} sablier{(j.sabliers ?? 0) > 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              ))}
          </div>
        )}

        <div className="rangee rangee-fin">
          <button type="button" className="btn btn-secondary" onClick={onCodex}>
            Voir au codex
          </button>
          <button ref={continuer} type="button" className="btn btn-primary" disabled={enVol} onClick={() => (nouvelle ? void rangerAuCodex() : onFermer())}>
            Continuer
          </button>
        </div>
      </section>
    </div>
  )
}

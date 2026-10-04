import { Fragment, useEffect, useLayoutEffect, useState } from 'react'

import type { Exemplaires } from '../contrat'
import { mouvementReduit } from '../services/animation'
import type { BriqueJeu } from '../services/jeu'
import { Brique } from './Brique'
import { Reserve, TYPE_GLISSE } from './Reserve'
import { useDialogue } from './useDialogue'

/** Pause avant la fermeture automatique : le joueur voit la dernière brique se poser (vol de 480 ms). */
const PAUSE_MS = 500
/** Vol des briques de la modale vers la table, et effacement de la feuille. */
const VOL_MS = 560
const SORTIE_MS = 280

/**
 * Retour à la table : chaque brique posée quitte la petite table de la modale et flotte jusqu'à sa case
 * sur la vraie table, pendant que la feuille s'efface (ou redescend, sur mobile) et que le voile se lève.
 * La brique qui vole est une copie de celle de la table, masquée jusqu'à l'arrivée de sa copie.
 */
function fermerEnVol(boite: HTMLElement | null, onFermer: () => void) {
  if (!boite || typeof boite.animate !== 'function' || mouvementReduit()) return onFermer()
  if (boite.dataset.sortie) return
  boite.dataset.sortie = '1'
  const scrim = boite.parentElement
  if (scrim) scrim.style.pointerEvents = 'none'
  boite.querySelectorAll<HTMLElement>('.rm-case').forEach((place, i) => {
    const source = place.querySelector<HTMLElement>('.brick')
    const cible = document.querySelector<HTMLElement>(`.slots [data-slot="${i}"] .brick`)
    if (!source || !cible) return
    const a = source.getBoundingClientRect()
    const b = cible.getBoundingClientRect()
    if (a.width === 0 || b.width === 0) return
    const copie = cible.cloneNode(true) as HTMLElement
    Object.assign(copie.style, { position: 'fixed', left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, margin: '0', zIndex: '70', pointerEvents: 'none', transformOrigin: '0 0' })
    copie.setAttribute('aria-hidden', 'true')
    document.body.append(copie)
    source.style.visibility = 'hidden'
    const depart = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`
    // Un léger décalage par case : les briques partent l'une après l'autre, comme posées à la main.
    const options = { duration: VOL_MS, delay: i * 50, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' } as const
    cible.animate([{ opacity: 0 }, { opacity: 0, offset: 0.9 }, { opacity: 1 }], options)
    copie
      .animate([{ transform: depart }, { transform: 'translate(0, -6px) rotate(-1.5deg)', offset: 0.7 }, { transform: 'none' }], options)
      .finished.finally(() => copie.remove())
  })
  const mobile = window.matchMedia?.('(max-width: 760px)').matches
  const options: KeyframeAnimationOptions = { duration: SORTIE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
  scrim?.querySelector('.scrim-fond')?.animate([{ opacity: 1 }, { opacity: 0 }], options)
  const fin = mobile ? [{ transform: 'translateY(100%)' }] : [{ opacity: 0, transform: 'translateY(10px) scale(0.97)' }]
  boite.animate([{ opacity: 1, transform: 'none' }, ...fin], options).finished.then(onFermer, onFermer)
}

interface Props {
  reserve: Exemplaires[]
  briques: Map<string, BriqueJeu>
  /** Cases de la table, chacune à sa place : `null` pour une case vide. */
  cases: (string | null)[]
  consommees: string[]
  /** Exemplaires disponibles, pour le titre. */
  exemplaires: number
  /** Case visée à l'ouverture ; `null` : la case vide la plus à gauche. */
  rang: number | null
  onPoser: (brique: string, rang: number) => void
  onRetirer: (rang: number) => void
  /** La table vient d'être complétée depuis la modale, qui va se fermer. */
  onComplete: () => void
  onFermer: () => void
}

/** « 1ʳᵉ », « 2ᵉ » : rang de la brique dans le mot. */
function ordinal(rang: number): string {
  return rang === 0 ? '1ʳᵉ' : `${rang + 1}ᵉ`
}

/**
 * Réserve en modale (App#9). Elle reste ouverte tant qu'une case est libre, et montre
 * la table en petit : on voit où va chaque brique, et on la retire d'un toucher.
 * Table complète, elle se ferme d'elle-même : il ne reste qu'à fusionner.
 */
export function ReserveModale({ reserve, briques, cases, consommees, exemplaires, rang, onPoser, onRetirer, onComplete, onFermer }: Props) {
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer, fermerEnVol)
  // Le message reste dans la modale : un message de la table s'afficherait derrière le voile.
  const [message, setMessage] = useState<string | null>(null)
  // Annonce pour les lecteurs d'écran : ce qui vient de se passer, puis la suite.
  const [annonce, setAnnonce] = useState('')
  const [vise, setVise] = useState(rang)
  // Dernière brique touchée : sa pastille rebondit ; dernière case remplie : sa brique y vole depuis la réserve.
  const [touchee, setTouchee] = useState<{ brique: string; rang: number; cle: number; sens: 'plus' | 'moins'; depuis?: DOMRect } | null>(null)
  const [complete, setComplete] = useState(false)
  /** Case survolée par une brique glissée. */
  const [survol, setSurvol] = useState<number | null>(null)

  const posees = cases.filter((b): b is string => b !== null)
  const cible = vise !== null && cases[vise] === null ? vise : cases.indexOf(null)
  const libelle = (id: string) => briques.get(id)?.libelle ?? ''

  // Vol depuis la réserve (FLIP) : la brique part de sa place dans la réserve, se pose dans la case et s'y écrase un peu.
  useLayoutEffect(() => {
    const brique = boite.current?.querySelector<HTMLElement>('.rm-case.arrive .brick')
    const a = touchee?.depuis
    if (!brique || !a || mouvementReduit() || typeof brique.animate !== 'function') return
    const b = brique.getBoundingClientRect()
    if (b.width === 0) return
    // Les briques de la réserve s'étirent sur leur ligne : l'échelle suit la plus petite des deux dimensions.
    const depart = `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${Math.min(a.width / b.width, a.height / b.height)})`
    brique.animate(
      [
        { transform: depart, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        { transform: 'none', offset: 0.75 },
        { transform: 'scaleY(0.94)', offset: 0.87 },
        { transform: 'none' },
      ],
      { duration: 480 },
    )
    // Une fois par pose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchee?.cle])

  useEffect(() => {
    if (!complete) return
    const minuteur = setTimeout(fermer, mouvementReduit() ? 0 : PAUSE_MS)
    return () => clearTimeout(minuteur)
  }, [complete, fermer])

  const choisir = (brique: string, depuis?: HTMLElement, visee = cible) => {
    if (complete) return
    if (visee < 0) {
      setMessage('La table est pleine. Touchez une brique posée, ci-dessus, pour libérer sa case.')
      return
    }
    onPoser(brique, visee)
    setMessage(null)
    setTouchee({ brique, rang: visee, cle: (touchee?.cle ?? 0) + 1, sens: 'moins', depuis: depuis?.getBoundingClientRect() })
    const suivante = cases.findIndex((b, i) => b === null && i !== visee)
    setVise(suivante < 0 ? null : suivante)
    if (suivante < 0) {
      setAnnonce(`${libelle(brique)} posée en case ${visee + 1}. La table est prête : fusionnez.`)
      setComplete(true)
      onComplete()
    } else {
      setAnnonce(`${libelle(brique)} posée en case ${visee + 1}. Choisissez la ${ordinal(suivante)} brique.`)
    }
  }

  const toucherCase = (i: number) => {
    if (complete) return
    const id = cases[i]
    setMessage(null)
    setVise(i)
    if (!id) return
    onRetirer(i)
    setTouchee({ brique: id, rang: -1, cle: (touchee?.cle ?? 0) + 1, sens: 'plus' })
    setAnnonce(`${libelle(id)} retirée de la case ${i + 1}. Choisissez la ${ordinal(i)} brique.`)
  }

  const compte = `${exemplaires} exemplaire${exemplaires > 1 ? 's' : ''}`
  const consigne = complete || cible < 0 ? 'La table est prête' : `Choisissez la ${ordinal(cible)} brique`
  // Toujours une ligne d'aide, pour que la feuille ne change pas de hauteur à la première pose.
  const aide = posees.length > 0 ? 'Touchez une brique posée pour la retirer.' : 'L’ordre compte : la case 1 ouvre le mot.'

  return (
    <div className="scrim" onClick={fermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue feuille reserve-modale" role="dialog" aria-modal="true" aria-label={`Réserve · ${compte}`} onClick={(e) => e.stopPropagation()}>
        <div className="rangee rangee-ecartee">
          {/* Le compte passe sous le titre : l'en-tête garde sa hauteur quand « Fermer » devient « Retour à la table ». */}
          <h2 className="jk-title rm-titre">
            Réserve
            <span className="rm-compte">{compte}</span>
          </h2>
          <button type="button" data-focus-initial className="btn btn-secondary" onClick={fermer}>
            {posees.length > 0 ? 'Retour à la table' : 'Fermer'}
          </button>
        </div>

        <div className="rm-table">
          <p className="rm-consigne" aria-hidden="true">
            {consigne}
          </p>
          <div className="rm-rail" role="group" aria-label="Table de fusion, dans l’ordre">
            {cases.map((id, i) => {
              const brique = id ? briques.get(id) : undefined
              const visee = !complete && i === cible
              const classes = ['rm-case', brique ? 'filled' : '', visee ? 'visee' : '', survol === i ? 'over' : '', brique && touchee?.rang === i ? 'arrive' : ''].filter(Boolean).join(' ')
              return (
                <Fragment key={i}>
                  {i > 0 && (
                    <span className="op" aria-hidden="true">
                      +
                    </span>
                  )}
                  <button
                    type="button"
                    className={classes}
                    aria-label={brique ? `Case ${i + 1} : ${brique.libelle}. Retirer` : `Case ${i + 1} vide${visee ? ', à remplir' : '. La choisir'}`}
                    aria-current={visee ? 'step' : undefined}
                    data-attendue={i === 0 ? 'prefixe' : i === cases.length - 1 ? 'suffixe' : undefined}
                    onClick={() => toucherCase(i)}
                    onDragOver={(e) => {
                      if (brique) return
                      e.preventDefault()
                      setSurvol(i)
                    }}
                    onDragLeave={() => setSurvol(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setSurvol(null)
                      const glissee = e.dataTransfer.getData(TYPE_GLISSE)
                      if (glissee && !brique) choisir(glissee, undefined, i)
                    }}
                  >
                    {brique ? (
                      <Brique key={touchee?.rang === i ? touchee.cle : 0} brique={brique} taille="s" />
                    ) : (
                      <span className="rm-num">{i + 1}</span>
                    )}
                  </button>
                </Fragment>
              )
            })}
          </div>
          <p className="rm-aide">{aide}</p>
        </div>

        <p className="sr-only" aria-live="polite">
          {annonce}
        </p>
        {message && (
          <p className="pk-note" role="status">
            {message}
          </p>
        )}
        <Reserve reserve={reserve} briques={briques} table={posees} consommees={consommees} touchee={touchee} onAjouter={choisir} onIndisponible={setMessage} />
      </section>
    </div>
  )
}

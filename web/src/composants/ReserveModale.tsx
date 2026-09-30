import { Fragment, useEffect, useState } from 'react'

import type { Exemplaires } from '../contrat'
import { mouvementReduit } from '../services/animation'
import type { BriqueJeu } from '../services/jeu'
import { Brique } from './Brique'
import { Reserve } from './Reserve'
import { useDialogue } from './useDialogue'

/** Pause avant la fermeture automatique : le joueur voit la dernière brique se poser. */
const PAUSE_MS = 350

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
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer)
  // Le message reste dans la modale : un message de la table s'afficherait derrière le voile.
  const [message, setMessage] = useState<string | null>(null)
  // Annonce pour les lecteurs d'écran : ce qui vient de se passer, puis la suite.
  const [annonce, setAnnonce] = useState('')
  const [vise, setVise] = useState(rang)
  // Dernière brique touchée : sa pastille rebondit ; dernière case remplie : sa brique s'y pose.
  const [touchee, setTouchee] = useState<{ brique: string; rang: number; cle: number } | null>(null)
  const [complete, setComplete] = useState(false)

  const posees = cases.filter((b): b is string => b !== null)
  const cible = vise !== null && cases[vise] === null ? vise : cases.indexOf(null)
  const libelle = (id: string) => briques.get(id)?.libelle ?? ''

  useEffect(() => {
    if (!complete) return
    const minuteur = setTimeout(fermer, mouvementReduit() ? 0 : PAUSE_MS)
    return () => clearTimeout(minuteur)
  }, [complete, fermer])

  const choisir = (brique: string) => {
    if (complete) return
    if (cible < 0) {
      setMessage('La table est pleine. Touchez une brique posée, ci-dessus, pour libérer sa case.')
      return
    }
    onPoser(brique, cible)
    setMessage(null)
    setTouchee({ brique, rang: cible, cle: (touchee?.cle ?? 0) + 1 })
    const suivante = cases.findIndex((b, i) => b === null && i !== cible)
    setVise(suivante < 0 ? null : suivante)
    if (suivante < 0) {
      setAnnonce(`${libelle(brique)} posée en case ${cible + 1}. La table est prête : fusionnez.`)
      setComplete(true)
      onComplete()
    } else {
      setAnnonce(`${libelle(brique)} posée en case ${cible + 1}. Choisissez la ${ordinal(suivante)} brique.`)
    }
  }

  const toucherCase = (i: number) => {
    if (complete) return
    const id = cases[i]
    setMessage(null)
    setVise(i)
    if (!id) return
    onRetirer(i)
    setTouchee({ brique: id, rang: -1, cle: (touchee?.cle ?? 0) + 1 })
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
              const classes = ['rm-case', brique ? 'filled' : '', visee ? 'visee' : '', brique && touchee?.rang === i ? 'arrive' : ''].filter(Boolean).join(' ')
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
                    onClick={() => toucherCase(i)}
                  >
                    {brique ? <Brique key={touchee?.rang === i ? touchee.cle : 0} brique={brique} taille="s" /> : <span className="rm-num">{i + 1}</span>}
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

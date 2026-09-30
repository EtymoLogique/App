import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import type { Etat, ReponseAchatSablier, ReponseSablier } from '../contrat'
import { useMaintenant } from '../services/horloge'
import { useEnLigne } from '../services/reseau'
import { LOTS, avantPlein, dureeLisible, dureeSablier, energieA, nombrePourRemplir, sabliersAchetables } from '../services/plis'
import { Compteur } from './Compteur'
import { fermerVersLeBas, useDialogue } from './useDialogue'

const sabliers = (n: number) => `${n} sablier${n > 1 ? 's' : ''}`
const gouttes = (n: number) => `${n} goutte${n > 1 ? 's' : ''}`
const SANS_SABLIERS = { detenus: 0, prix_gouttes: 10 }

/** Icône du sablier (plis.html). */
export function Sablier() {
  return (
    <svg className="pk-glass" viewBox="0 0 16 20" aria-hidden="true">
      <path d="M2 1.5h12M2 18.5h12M3.5 1.5c0 5 4.5 5.5 4.5 8.5s-4.5 3.5-4.5 8.5h9c0-5-4.5-5.5-4.5-8.5s4.5-3.5 4.5-8.5z" />
    </svg>
  )
}

export type Envoi<T> = (nombre: number) => Promise<T | { erreur: string }>

/**
 * Raccourci là où le temps manque (ADR 0039) : « Avancer » avec des sabliers
 * s'il en reste, sinon « Acheter des sabliers », qui échange des gouttes et
 * avance le temps d'un seul geste. Le prix n'est pas sur le bouton : il
 * dépend du lot choisi dans la feuille.
 */
export function RaccourciSabliers({ etat, utiliser, acheter }: { etat: Etat | null; utiliser: Envoi<ReponseSablier>; acheter: Envoi<ReponseSablier | ReponseAchatSablier> }) {
  const enLigne = useEnLigne()
  const [feuille, setFeuille] = useState<'utiliser' | 'acheter' | null>(null)
  const maintenant = useMaintenant()
  if (!etat || energieA(etat.energie, maintenant).prochaine === null) return null
  const s = etat.sabliers ?? SANS_SABLIERS
  const fermer = () => setFeuille(null)
  return (
    <>
      {s.detenus > 0 ? (
        <button type="button" className="btn btn-secondary pk-sandbtn" disabled={!enLigne} onClick={() => setFeuille('utiliser')} title="Faire avancer le temps avec des sabliers" aria-label={`Faire avancer le temps avec des sabliers (${sabliers(s.detenus)})`}>
          <Sablier />
          Avancer · <Compteur valeur={s.detenus} />
        </button>
      ) : (
        <button type="button" className="btn btn-secondary pk-sandbtn" disabled={!enLigne} onClick={() => setFeuille('acheter')} title="Échanger des gouttes contre des sabliers">
          <Sablier />
          Acheter des sabliers
        </button>
      )}
      {feuille === 'utiliser' && <FeuilleUtiliser etat={etat} envoyer={utiliser} onFermer={fermer} />}
      {feuille === 'acheter' && <FeuilleAcheter etat={etat} envoyer={acheter} onFermer={fermer} />}
    </>
  )
}

/**
 * Feuille d'achat (I-22, ADR 0039) : les trois lots de la boutique. Un lot se
 * choisit d'un clic, sans confirmation : l'échange est fait et les sabliers
 * servent aussitôt, dans la limite de ce qui remplit l'énergie.
 */
export function FeuilleAcheter({ etat, envoyer, onFermer }: { etat: Etat; envoyer: Envoi<ReponseSablier | ReponseAchatSablier>; onFermer: () => void }) {
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer)
  const [envoi, setEnvoi] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const s = etat.sabliers ?? SANS_SABLIERS

  const choisir = async (nombre: number) => {
    setEnvoi(nombre)
    setErreur(null)
    const reponse = await envoyer(nombre)
    setEnvoi(null)
    if ('erreur' in reponse) setErreur(reponse.erreur)
    else fermer()
  }

  return (
    <div className="scrim" onClick={fermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue feuille" role="dialog" aria-modal="true" aria-labelledby="achat-titre" onClick={(e) => e.stopPropagation()}>
        <h2 id="achat-titre" className="jk-title">
          Acheter <em>des sabliers</em>
        </h2>
        <p className="pk-note">
          Vous avez {gouttes(etat.encre)} d’encre. Les sabliers achetés avancent aussitôt la recharge, dans la limite de ce qui remplit vos plis ; le reste est gardé.
        </p>
        <ul className="pk-lots">
          {LOTS.map(({ nombre, titre }) => {
            const cout = nombre * s.prix_gouttes
            const manque = cout - etat.encre
            return (
              <li key={nombre}>
                <button type="button" className="btn btn-secondary pk-lot" disabled={envoi !== null || manque > 0} aria-label={`${titre} contre ${gouttes(cout)}`} onClick={() => void choisir(nombre)}>
                  <span className="bq-troc" aria-hidden="true">
                    <span className="pk-drop" />
                    <b>{cout}</b>
                    <span className="bq-fleche">→</span>
                    <Sablier />
                    <b>{nombre}</b>
                  </span>
                  <span className="pk-lot-texte">{envoi === nombre ? 'Un instant…' : manque > 0 ? `Il vous manque ${gouttes(manque)}.` : titre}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {erreur && (
          <p className="pk-note" role="alert">
            {erreur}
          </p>
        )}
        <div className="rangee rangee-fin rangee-actions">
          <button type="button" className="btn btn-secondary" onClick={fermer}>
            Annuler
          </button>
        </div>
      </section>
    </div>
  )
}

/** Feuille d'utilisation (I-22) : jamais plus que les sabliers détenus ni que ce qui remplit l'énergie. */
export function FeuilleUtiliser({ etat, envoyer, onFermer }: { etat: Etat; envoyer: Envoi<ReponseSablier>; onFermer: () => void }) {
  const maintenant = useMaintenant()
  const s = etat.sabliers ?? SANS_SABLIERS
  const maximum = Math.max(1, Math.min(nombrePourRemplir(etat.energie, maintenant), s.detenus))
  return (
    <Feuille titre={<>Faire avancer le temps <em>avec des sabliers</em></>} maximum={maximum} initial={maximum} envoyer={envoyer} onFermer={onFermer} action={(n) => `Utiliser ${sabliers(n)}`}>
      {(n) => `Recharge avancée de ${dureeLisible(Math.min(n * dureeSablier(etat.energie), avantPlein(etat.energie, maintenant)))}.`}
    </Feuille>
  )
}

/**
 * Feuille d'échange (I-22, ADR 0039) : 10 gouttes le sablier, sans plafond.
 * Propose `initial`, sinon ce qui manque pour remplir l'énergie.
 */
export function FeuilleEchanger({ etat, envoyer, onFermer, initial }: { etat: Etat; envoyer: Envoi<ReponseAchatSablier>; onFermer: () => void; initial?: number }) {
  const maintenant = useMaintenant()
  const s = etat.sabliers ?? SANS_SABLIERS
  const maximum = Math.max(1, sabliersAchetables(s, etat.encre))
  const manquants = initial ?? nombrePourRemplir(etat.energie, maintenant) - s.detenus
  return (
    <Feuille titre={<>Échanger <em>contre des sabliers</em></>} maximum={maximum} initial={Math.max(1, Math.min(manquants, maximum))} envoyer={envoyer} onFermer={onFermer} action={(n) => `Échanger ${gouttes(n * s.prix_gouttes)}`}>
      {(n) => `${gouttes(n * s.prix_gouttes)} d’encre · il vous en restera ${etat.encre - n * s.prix_gouttes}.`}
    </Feuille>
  )
}

/** Feuille commune : un nombre de sabliers, son effet, puis la confirmation. */
function Feuille<T>({
  titre,
  maximum,
  initial,
  envoyer,
  onFermer,
  action,
  children,
}: {
  titre: ReactNode
  maximum: number
  initial: number
  envoyer: Envoi<T>
  onFermer: () => void
  action: (n: number) => string
  children: (n: number) => ReactNode
}) {
  const [choisi, setNombre] = useState(initial)
  // L'horloge peut faire baisser le maximum pendant que la feuille est ouverte.
  const nombre = Math.min(choisi, maximum)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const premier = useRef<HTMLButtonElement>(null)
  const boite = useRef<HTMLElement>(null)
  const fermer = useCallback(() => fermerVersLeBas(boite.current, onFermer), [onFermer])
  useEffect(() => {
    premier.current?.focus({ preventScroll: true })
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [fermer])

  const confirmer = async () => {
    setEnvoi(true)
    const reponse = await envoyer(nombre)
    setEnvoi(false)
    if (typeof reponse === 'object' && reponse !== null && 'erreur' in reponse) setErreur(reponse.erreur)
    else fermer()
  }

  return (
    <div className="scrim" onClick={fermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue feuille" role="dialog" aria-modal="true" aria-labelledby="sabliers-titre" onClick={(e) => e.stopPropagation()}>
        <h2 id="sabliers-titre" className="jk-title">
          {titre}
        </h2>
        <div className="rangee rangee-centree" role="group" aria-label="Nombre de sabliers">
          <button ref={premier} type="button" className="btn btn-secondary" aria-label="Un sablier de moins" disabled={nombre <= 1} onClick={() => setNombre(nombre - 1)}>
            −
          </button>
          <span className="pk-inkbox" aria-live="polite">
            <Sablier />
            <strong>{nombre}</strong>
          </span>
          <button type="button" className="btn btn-secondary" aria-label="Un sablier de plus" disabled={nombre >= maximum} onClick={() => setNombre(nombre + 1)}>
            +
          </button>
        </div>
        <p className="pk-note">{children(nombre)}</p>
        {erreur && (
          <p className="pk-note" role="alert">
            {erreur}
          </p>
        )}
        <div className="rangee rangee-fin rangee-actions">
          <button type="button" className="btn btn-secondary" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" disabled={envoi} onClick={() => void confirmer()}>
            {envoi ? 'Un instant…' : action(nombre)}
          </button>
        </div>
      </section>
    </div>
  )
}

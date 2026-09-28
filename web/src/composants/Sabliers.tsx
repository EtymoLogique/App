import { type ReactNode, useEffect, useRef, useState } from 'react'

import type { Etat, ReponseAchatSablier, ReponseSablier } from '../contrat'
import { useMaintenant } from '../services/horloge'
import { avantPlein, dureeLisible, dureeSablier, energieA, nombrePourRemplir, sabliersAchetables } from '../services/plis'
import { Compteur } from './Compteur'
import { Icone } from './Icone'

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
 * s'il en reste, sinon « Échanger » des gouttes, sans passer par la boutique.
 */
export function RaccourciSabliers({ etat, utiliser, acheter }: { etat: Etat | null; utiliser: Envoi<ReponseSablier>; acheter: Envoi<ReponseAchatSablier> }) {
  const [feuille, setFeuille] = useState<'utiliser' | 'echanger' | null>(null)
  const maintenant = useMaintenant()
  if (!etat || energieA(etat.energie, maintenant).prochaine === null) return null
  const s = etat.sabliers ?? SANS_SABLIERS
  const fermer = () => setFeuille(null)
  return (
    <>
      {s.detenus > 0 ? (
        <button type="button" className="btn btn-secondary pk-sandbtn" onClick={() => setFeuille('utiliser')} title="Faire avancer le temps avec des sabliers" aria-label={`Faire avancer le temps avec des sabliers (${sabliers(s.detenus)})`}>
          <Sablier />
          Avancer · <Compteur valeur={s.detenus} />
        </button>
      ) : (
        <button type="button" className="btn btn-secondary pk-sandbtn" disabled={sabliersAchetables(s, etat.encre) === 0} onClick={() => setFeuille('echanger')} title={`Un sablier coûte ${gouttes(s.prix_gouttes)}`}>
          <Icone nom="goutte" />
          {sabliersAchetables(s, etat.encre) === 0 ? `Il faut ${gouttes(s.prix_gouttes)}` : `Échanger · ${gouttes(s.prix_gouttes)}`}
        </button>
      )}
      {feuille === 'utiliser' && <FeuilleUtiliser etat={etat} envoyer={utiliser} onFermer={fermer} />}
      {feuille === 'echanger' && <FeuilleEchanger etat={etat} envoyer={acheter} onFermer={fermer} />}
    </>
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
  useEffect(() => {
    premier.current?.focus({ preventScroll: true })
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer])

  const confirmer = async () => {
    setEnvoi(true)
    const reponse = await envoyer(nombre)
    setEnvoi(false)
    if (typeof reponse === 'object' && reponse !== null && 'erreur' in reponse) setErreur(reponse.erreur)
    else onFermer()
  }

  return (
    <div className="scrim" onClick={onFermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section className="dialogue feuille" role="dialog" aria-modal="true" aria-labelledby="sabliers-titre" onClick={(e) => e.stopPropagation()}>
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
        <div className="rangee rangee-ecartee">
          <button type="button" className="btn btn-secondary" onClick={onFermer}>
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

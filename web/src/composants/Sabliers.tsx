import { useEffect, useRef, useState } from 'react'

import type { Etat, ReponseSablier } from '../contrat'
import { useMaintenant } from '../services/horloge'
import { duree, dureeSablier, energieA, nombreSansPerte, perteSablier, repartirSabliers } from '../services/plis'

const sabliers = (n: number) => `${n} sablier${n > 1 ? 's' : ''}`
const gouttes = (n: number) => `${n} goutte${n > 1 ? 's' : ''}`

/** Icône du sablier (plis.html). */
export function Sablier() {
  return (
    <svg className="pk-glass" viewBox="0 0 16 20" aria-hidden="true">
      <path d="M2 1.5h12M2 18.5h12M3.5 1.5c0 5 4.5 5.5 4.5 8.5s-4.5 3.5-4.5 8.5h9c0-5-4.5-5.5-4.5-8.5s4.5-3.5 4.5-8.5z" />
    </svg>
  )
}

interface Props {
  etat: Etat | null
  utiliser: (nombre: number) => Promise<ReponseSablier | { erreur: string }>
}

/** Bande des sabliers (I-20) : détenus, bouton « Utiliser » et plafond du jour (ADR 0020). */
export function CarteSabliers({ etat, utiliser }: Props) {
  const [ouverte, setOuverte] = useState(false)
  const maintenant = useMaintenant()
  const s = etat?.sabliers
  const plein = etat ? energieA(etat.energie, maintenant).prochaine === null : true
  const restants = s ? s.plafond_jour - s.utilises_24h : 0
  const possible = etat && s && !plein && restants > 0 && s.detenus + etat.encre > 0
  return (
    <div className="pk-card" id="sablier">
      <p className="pk-label">Sabliers</p>
      <div className="pk-inkbox">
        <Sablier />
        <strong>{s?.detenus ?? 0}</strong>
        <small>sabliers · {s?.plafond_detenus ?? 36} au plus</small>
      </div>
      <button type="button" className="btn btn-secondary pk-hintbtn pk-sandbtn" disabled={!possible} onClick={() => setOuverte(true)}>
        {plein ? 'Énergie pleine : rien à avancer' : restants <= 0 ? 'Plafond du jour atteint' : 'Utiliser des sabliers'}
      </button>
      <p className="pk-note">
        Aujourd’hui&nbsp;: {s?.utilises_24h ?? 0}&nbsp;/&nbsp;{s?.plafond_jour ?? 12}. Un sablier avance la recharge d’une heure&nbsp;; une goutte d’encre en achète un.
      </p>
      {ouverte && etat && <FeuilleSabliers etat={etat} utiliser={utiliser} onFermer={() => setOuverte(false)} />}
    </div>
  )
}

/** Feuille des sabliers (I-22) : quantité, répartition, temps gagné, perte annoncée avant de confirmer. */
function FeuilleSabliers({ etat, utiliser, onFermer }: Props & { etat: Etat; onFermer: () => void }) {
  const maintenant = useMaintenant()
  const s = etat.sabliers ?? { detenus: 0, utilises_24h: 0, plafond_jour: 12, plafond_detenus: 36 }
  const maximum = Math.max(1, Math.min(s.plafond_jour - s.utilises_24h, s.detenus + etat.encre))
  const sansPerte = nombreSansPerte(etat.energie, maintenant)
  const [nombre, setNombre] = useState(() => Math.max(1, Math.min(sansPerte, maximum)))
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const premier = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    premier.current?.focus({ preventScroll: true })
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer])

  const repartition = repartirSabliers(nombre, s.detenus, etat.encre, s.utilises_24h, s.plafond_jour)
  const perte = perteSablier(etat.energie, nombre, maintenant)
  const confirmer = async () => {
    setEnvoi(true)
    const reponse = await utiliser(nombre)
    setEnvoi(false)
    if ('erreur' in reponse) setErreur(reponse.erreur)
    else onFermer()
  }

  return (
    <div className="scrim" onClick={onFermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section className="dialogue" role="dialog" aria-modal="true" aria-labelledby="sabliers-titre" onClick={(e) => e.stopPropagation()}>
        <h2 id="sabliers-titre" className="jk-title">
          Utiliser <em>des sabliers</em>
        </h2>
        <div className="rangee rangee-centree" role="group" aria-label="Nombre de sabliers">
          <button ref={premier} type="button" className="btn btn-secondary" aria-label="Un sablier de moins" disabled={nombre <= 1} onClick={() => setNombre((n) => n - 1)}>
            −
          </button>
          <span className="pk-inkbox" aria-live="polite">
            <Sablier />
            <strong>{nombre}</strong>
          </span>
          <button type="button" className="btn btn-secondary" aria-label="Un sablier de plus" disabled={nombre >= maximum} onClick={() => setNombre((n) => n + 1)}>
            +
          </button>
        </div>
        <p className="pk-note">
          {repartition
            ? [repartition.detenus > 0 && `${sabliers(repartition.detenus)} détenu${repartition.detenus > 1 ? 's' : ''}`, repartition.encre > 0 && `${gouttes(repartition.encre)} d’encre`].filter(Boolean).join(' + ')
            : 'Pas assez de sabliers ni d’encre.'}{' '}
          · recharge avancée de {duree(nombre * dureeSablier(etat.energie))}.
        </p>
        {perte > 0 && (
          <p className="pk-note" role="alert">
            Vos deux plis seront prêts avant la fin&nbsp;: {duree(perte)} seront perdues.{' '}
            {sansPerte > 0 && (
              <button type="button" className="btn-lien" onClick={() => setNombre(Math.min(sansPerte, maximum))}>
                Utiliser {sabliers(sansPerte)}, sans rien perdre
              </button>
            )}
          </p>
        )}
        {erreur && (
          <p className="pk-note" role="alert">
            {erreur}
          </p>
        )}
        <div className="rangee rangee-ecartee">
          <button type="button" className="btn btn-secondary" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" disabled={!repartition || envoi} onClick={() => void confirmer()}>
            {envoi ? 'Un instant…' : `Utiliser ${sabliers(nombre)}`}
          </button>
        </div>
      </section>
    </div>
  )
}

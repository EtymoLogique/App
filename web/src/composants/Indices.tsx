import { useEffect, useRef, useState } from 'react'

import type { Etat, ReponseIndice } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import { TITRES_INDICES, ciblesIndice, contenuIndice, niveauObtenu } from '../services/indices'
import type { CatalogueJeu } from '../services/jeu'
import { Icone } from './Icone'

interface Props {
  jeu: CatalogueJeu
  etat: Etat | null
  entrees: EntreeCodex[]
  acheter: (recette: string, niveau: number) => Promise<ReponseIndice | { erreur: string }>
  onFermer: () => void
}

/**
 * Indices (I-12, ADR 0038) : une silhouette à trouver, puis ses cinq niveaux,
 * du plus vague à la solution, achetés dans l'ordre contre de l'encre.
 */
export function Indices({ jeu, etat, entrees, acheter, onFermer }: Props) {
  const cibles = ciblesIndice(jeu, entrees)
  const [choisie, setChoisie] = useState(cibles[0]?.recette.id ?? null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const fermer = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    fermer.current?.focus({ preventScroll: true })
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer])

  const cible = cibles.find((c) => c.recette.id === choisie) ?? cibles[0]
  const obtenu = cible ? niveauObtenu(etat, cible.recette.id) : 0
  const encre = etat?.encre ?? 0
  const prix = etat?.prix_indices ?? []

  const payer = async (niveau: number) => {
    if (!cible) return
    setEnvoi(true)
    setErreur(null)
    const reponse = await acheter(cible.recette.id, niveau)
    setEnvoi(false)
    if ('erreur' in reponse) setErreur(reponse.erreur)
  }

  return (
    <div className="scrim" onClick={onFermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section className="dialogue indices" role="dialog" aria-modal="true" aria-labelledby="indices-titre" onClick={(e) => e.stopPropagation()}>
        <div className="rangee rangee-ecartee">
          <h2 id="indices-titre" className="jk-title">
            Indices
          </h2>
          <span className="pk-inkbox" aria-label={`${encre} gouttes d’encre`}>
            <span className="pk-drop" aria-hidden="true" />
            <strong>{encre}</strong>
          </span>
        </div>
        {!cible ? (
          <p className="pk-note">Aucune silhouette à trouver pour l’instant.</p>
        ) : (
          <>
            <div className="rangee" role="group" aria-label="Silhouette visée">
              {cibles.map((c) => (
                <button key={c.recette.id} type="button" className="cb-chip" aria-pressed={c.recette.id === cible.recette.id} onClick={() => setChoisie(c.recette.id)}>
                  <span>N°&nbsp;{String(c.entree.n).padStart(3, '0')}</span>
                </button>
              ))}
            </div>
            {cible.entree.sens && <p className="pk-note">«&nbsp;{cible.entree.sens}&nbsp;»</p>}
            <ol className="indices-niveaux">
              {TITRES_INDICES.map((titre, i) => {
                const niveau = i + 1
                const cout = prix[i]
                return (
                  <li key={titre} className={niveau <= obtenu ? 'is-obtenu' : undefined}>
                    <span>
                      <b>
                        {niveau} · {titre}
                      </b>
                      {niveau <= obtenu && <small>{contenuIndice(jeu, cible.recette, niveau, etat)}</small>}
                    </span>
                    {niveau <= obtenu ? (
                      <span aria-label="Obtenu">✓</span>
                    ) : niveau === obtenu + 1 && cout !== undefined ? (
                      <button type="button" className="btn btn-primary" disabled={envoi || encre < cout} onClick={() => void payer(niveau)}>
                        {cout}&nbsp;gouttes
                      </button>
                    ) : (
                      <Icone nom="verrou" />
                    )}
                  </li>
                )
              })}
            </ol>
            {erreur && (
              <p className="pk-note" role="alert">
                {erreur}
              </p>
            )}
            <p className="pk-note">Un niveau à la fois, du plus vague à la solution. Chacun ne se paie qu’une fois.</p>
          </>
        )}
        <div className="rangee rangee-fin">
          <button ref={fermer} type="button" className="btn btn-secondary" onClick={onFermer}>
            Fermer
          </button>
        </div>
      </section>
    </div>
  )
}

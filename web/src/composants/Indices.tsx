import { useState } from 'react'

import type { Etat, ReponseIndice } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import { TITRES_INDICES, contenuIndice, indiceCourant, niveauObtenu } from '../services/indices'
import type { CatalogueJeu } from '../services/jeu'
import { useEnLigne } from '../services/reseau'
import { Icone } from './Icone'
import { useDialogue } from './useDialogue'

interface Props {
  jeu: CatalogueJeu
  etat: Etat | null
  entrees: EntreeCodex[]
  acheter: (recette: string, niveau: number) => Promise<ReponseIndice | { erreur: string }>
  onFermer: () => void
}

/**
 * Indices (I-12, ADR 0038) : une seule silhouette à trouver (indiceCourant), puis ses cinq niveaux,
 * du plus vague à la solution, achetés dans l'ordre contre de l'encre.
 */
export function Indices({ jeu, etat, entrees, acheter, onFermer }: Props) {
  const enLigne = useEnLigne()
  // Choisie à l'ouverture : acheter un niveau ne la remplace pas sous les yeux du joueur.
  const [cible] = useState(() => indiceCourant(jeu, entrees, etat))
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer)

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
    <div className="scrim" onClick={fermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue feuille indices" role="dialog" aria-modal="true" aria-labelledby="indices-titre" onClick={(e) => e.stopPropagation()}>
        <div className="rangee rangee-ecartee">
          <h2 id="indices-titre" className="jk-title">
            Indice
          </h2>
          <span className="rangee">
            <span className="pk-inkbox" aria-label={`${encre} gouttes d’encre`}>
              <span className="pk-drop" aria-hidden="true" />
              <strong>{encre}</strong>
            </span>
            <button data-focus-initial type="button" className="btn btn-secondary" onClick={fermer}>
              Fermer
            </button>
          </span>
        </div>
        {!cible ? (
          <p className="pk-note">Aucun mot à former avec vos briques pour l’instant. Ouvrez un pli pour en obtenir d’autres.</p>
        ) : (
          <>
            <p className="panel-k">Silhouette N°&nbsp;{String(cible.entree.n).padStart(3, '0')}</p>
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
                      {niveau <= obtenu && (
                        <small>
                          {contenuIndice(jeu, cible.recette, niveau, etat).map((p, j) =>
                            typeof p === 'string' ? (
                              p
                            ) : (
                              <span key={j} className="bchip" data-kind={p.nature}>
                                {p.libelle}
                              </span>
                            ),
                          )}
                        </small>
                      )}
                      {niveau === obtenu + 1 && cout !== undefined && encre < cout && <small>Il vous manque {cout - encre}&nbsp;goutte{cout - encre > 1 ? 's' : ''}.</small>}
                    </span>
                    {niveau <= obtenu ? (
                      <span aria-label="Obtenu">✓</span>
                    ) : niveau === obtenu + 1 && cout !== undefined ? (
                      <button type="button" className="btn btn-primary btn-prix" aria-label={`${cout} gouttes`} disabled={!enLigne || envoi || encre < cout} onClick={() => void payer(niveau)}>
                        {cout}
                        <Icone nom="goutte" />
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
      </section>
    </div>
  )
}

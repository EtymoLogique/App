import { useEffect, useRef, useState } from 'react'

import type { Etat, ReponseIndice } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import { INDICES, contenuIndice, indiceCourant, indicesObtenus } from '../services/indices'
import type { CatalogueJeu } from '../services/jeu'
import { useEnLigne } from '../services/reseau'
import { chargerSilhouette } from '../services/silhouettes'
import { Icone } from './Icone'
import { useDialogue } from './useDialogue'

interface Props {
  jeu: CatalogueJeu
  etat: Etat | null
  entrees: EntreeCodex[]
  acheter: (recette: string, niveau: number) => Promise<ReponseIndice | { erreur: string }>
  /** Lecture vérifiée d'un média du catalogue (silhouettes des cartes). */
  lireMedia: (chemin: string) => Promise<string>
  onFermer: () => void
}

/** La silhouette d'une carte à trouver, insérée dans la page pour prendre la teinte de l'encre. */
function Silhouette({ chemin, lireMedia }: { chemin: string; lireMedia: Props['lireMedia'] }) {
  const hote = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let actif = true
    void chargerSilhouette(chemin, lireMedia).then((svg) => {
      if (actif && svg && hote.current) hote.current.replaceChildren(svg)
    })
    return () => {
      actif = false
    }
  }, [chemin, lireMedia])
  return <span ref={hote} className="indice-art" aria-hidden="true" />
}

/**
 * Indices (I-12, ADR 0051) : une seule silhouette à trouver (indiceCourant), puis trois indices au
 * choix (silhouette, sens littéral, définition), chacun acheté une fois contre de l'encre.
 */
export function Indices({ jeu, etat, entrees, acheter, lireMedia, onFermer }: Props) {
  const enLigne = useEnLigne()
  // Choisie à l'ouverture : acheter un indice ne la remplace pas sous les yeux du joueur.
  const [cible] = useState(() => indiceCourant(jeu, entrees, etat))
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer)

  const obtenus = cible ? indicesObtenus(etat, cible.recette.id) : new Set<number>()
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
            {cible && <small className="panel-k">N°&nbsp;{String(cible.entree.n).padStart(3, '0')}</small>}
          </h2>
          <button data-focus-initial type="button" className="btn btn-secondary" onClick={fermer}>
            Fermer
          </button>
        </div>
        {!cible ? (
          <p className="pk-note">Aucun mot à former avec vos briques pour l’instant. Ouvrez un pli pour en obtenir d’autres.</p>
        ) : (
          <>
            <ul className="indices-liste">
              {INDICES.map(({ niveau, titre }) => {
                const contenu = contenuIndice(jeu, cible.entree, niveau)
                if (!contenu) return null
                const cout = prix[niveau - 1]
                const obtenu = obtenus.has(niveau)
                return (
                  <li key={niveau} className={obtenu ? 'is-obtenu' : undefined}>
                    <h3>{titre}</h3>
                    {obtenu ? (
                      <span aria-label="Obtenu">✓</span>
                    ) : (
                      cout !== undefined && (
                        <button type="button" className="btn btn-primary btn-prix" aria-label={`${titre}, ${cout} gouttes`} disabled={!enLigne || envoi || encre < cout} onClick={() => void payer(niveau)}>
                          <span className="prix">{cout}</span>
                          <Icone nom="goutte" />
                        </button>
                      )
                    )}
                    {obtenu && (
                      <div className="indice-contenu">
                        {contenu.silhouette && <Silhouette chemin={contenu.silhouette} lireMedia={lireMedia} />}
                        {contenu.texte && (niveau === 3 ? <p className="bf-def">{contenu.texte}</p> : <p className="bf-lit">«&nbsp;{contenu.texte}&nbsp;»</p>)}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            {erreur && (
              <p className="pk-note" role="alert">
                {erreur}
              </p>
            )}
            <p className="pk-note">Chaque indice ne se paie qu’une fois.</p>
          </>
        )}
      </section>
    </div>
  )
}

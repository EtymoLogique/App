import { useState } from 'react'

import type { Enquete } from '../services/indices'
import { CarteSilhouette } from './CarteSilhouette'

/** Enquêtes montrées d'emblée ; les autres se déplient d'un bouton. */
const VISIBLES = 3

interface Props {
  enquetes: Enquete[]
  /** Lecture vérifiée d'un média du catalogue (silhouettes des cartes). */
  lireMedia: (chemin: string) => Promise<string>
}

const numero = (n: number) => `N° ${String(n).padStart(3, '0')}`

/** « Silhouette, définition » : les indices obtenus, le premier avec sa majuscule. */
function resume(enquete: Enquete): string {
  return enquete.obtenus.map((o, i) => (i === 0 ? o.titre : o.titre.toLowerCase())).join(', ')
}

/**
 * Enquêtes en cours (App#88) : sous la table, une ligne repliée par carte à trouver dont un indice
 * est acheté ; dépliée, ce qui a été payé, et rien d'autre (ADR 0051). Aucun bouton d'achat :
 * la feuille des indices reste le seul guichet.
 */
export function Enquetes({ enquetes, lireMedia }: Props) {
  const [toutes, setToutes] = useState(false)
  if (enquetes.length === 0) return null
  const montrees = toutes ? enquetes : enquetes.slice(0, VISIBLES)
  const reste = enquetes.length - VISIBLES
  return (
    <section className="panel enquetes" aria-labelledby="enquetes-titre">
      <div className="panel-head">
        <h2 id="enquetes-titre">{enquetes.length > 1 ? 'Enquêtes en cours' : 'Enquête en cours'}</h2>
        <span className="status">{enquetes.length}</span>
      </div>
      <div className="enquetes-liste">
        {montrees.map((enquete) => {
          const { entree, obtenus } = enquete
          const texte = [...obtenus].reverse().find((o) => o.contenu.texte)
          return (
            <details key={entree.id} className="enquete" name="enquetes">
              <summary>
                <span className="enquete-ligne">
                  <span className="enquete-num">{numero(entree.n)}</span>
                  <span className="enquete-obtenus"> · {resume(enquete)}</span>
                </span>
                {texte && <span className="enquete-apercu">{texte.niveau === 2 ? `« ${texte.contenu.texte} »` : texte.contenu.texte}</span>}
              </summary>
              <div className="enquete-corps">
                {obtenus.map(({ niveau, titre, contenu }) =>
                  contenu.silhouette ? (
                    <CarteSilhouette key={niveau} entree={entree} chemin={contenu.silhouette} lireMedia={lireMedia} />
                  ) : (
                    <div key={niveau} className="enquete-texte">
                      <h3 className="panel-k">{titre}</h3>
                      {niveau === 3 ? <p className="bf-def">{contenu.texte}</p> : <p className="bf-lit">«&nbsp;{contenu.texte}&nbsp;»</p>}
                    </div>
                  ),
                )}
              </div>
            </details>
          )
        })}
      </div>
      {reste > 0 && (
        <button type="button" className="panel-link" aria-expanded={toutes} onClick={() => setToutes(!toutes)}>
          {toutes ? 'Replier' : `Voir les ${enquetes.length} enquêtes`}
        </button>
      )}
    </section>
  )
}

import { useState } from 'react'

import { useEnLigne } from '../services/reseau'

import type { Etat, ReponseAchatSablier } from '../contrat'
import { Compteur } from './Compteur'
import { Icone } from './Icone'
import { type Envoi, FeuilleEchanger, Sablier } from './Sabliers'

/** Lots proposés d'emblée ; la feuille permet d'en choisir d'autres. */
const LOTS = [
  { nombre: 1, titre: 'Un sablier', texte: 'Avance la recharge des plis d’une heure.' },
  { nombre: 3, titre: 'Trois sabliers', texte: 'Trois heures de moins avant le prochain pli.' },
  { nombre: 12, titre: 'Douze sabliers', texte: 'Une recharge entière : un pli de plus.' },
]

interface Props {
  etat: Etat | null
  acheter: Envoi<ReponseAchatSablier>
}

/**
 * Boutique (ADR 0018, 0039) : d'abord les échanges entre ressources du jeu,
 * sans limite ; puis l'achat de gouttes en euros, fermé tant qu'aucun ADR
 * ne l'accepte.
 */
export function Boutique({ etat, acheter }: Props) {
  const enLigne = useEnLigne()
  const [lot, setLot] = useState<number | null>(null)
  const encre = etat?.encre ?? 0
  const prix = etat?.sabliers?.prix_gouttes ?? 10
  const detenus = etat?.sabliers?.detenus ?? 0
  return (
    <div className="bq">
      <div className="bq-soldes" aria-label="Vos ressources">
        <span className="bq-solde">
          <span className="pk-drop" aria-hidden="true" />
          <Compteur valeur={etat?.encre} /> <small>goutte{encre > 1 ? 's' : ''}</small>
        </span>
        <span className="bq-solde">
          <Sablier />
          <Compteur valeur={etat?.sabliers?.detenus} /> <small>sablier{detenus > 1 ? 's' : ''}</small>
        </span>
      </div>

      <section className="bq-section" aria-labelledby="bq-echanges">
        <div className="bq-tete">
          <p className="pk-label">Échanges</p>
          <h2 id="bq-echanges">
            Votre encre, <em>contre du temps</em>
          </h2>
          <p>Les gouttes gagnées en ouvrant des plis s’échangent contre des sabliers, autant que vous le souhaitez. Un sablier avance la recharge d’une heure.</p>
        </div>
        <div className="bq-offres">
          {LOTS.map(({ nombre, titre, texte }) => {
            const cout = nombre * prix
            return (
              <article key={nombre} className="pk-card bq-offre">
                <div className="bq-troc" aria-label={`${cout} gouttes contre ${nombre} sablier${nombre > 1 ? 's' : ''}`}>
                  <span className="pk-drop" aria-hidden="true" />
                  <b>{cout}</b>
                  <span className="bq-fleche" aria-hidden="true">
                    →
                  </span>
                  <Sablier />
                  <b>{nombre}</b>
                </div>
                <h3>{titre}</h3>
                <p>{texte}</p>
                <button type="button" className="btn btn-secondary" disabled={!enLigne || !etat || encre < cout} onClick={() => setLot(nombre)}>
                  Échanger
                </button>
                {etat && encre < cout && (
                  <p className="bq-manque">
                    Il vous manque {cout - encre}&nbsp;goutte{cout - encre > 1 ? 's' : ''}.
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="bq-section" aria-labelledby="bq-achats">
        <div className="bq-tete">
          <p className="pk-label">
            Achats
            <span className="bq-bientot">
              <Icone nom="verrou" />
              Bientôt ouvert
            </span>
          </p>
          <h2 id="bq-achats">
            Des gouttes, <em>en euros</em>
          </h2>
        </div>
        <div className="bq-ferme">
          <Icone nom="verrou" />
          <p>
            <b>Pas encore ouvert.</b> Des lots de gouttes d’encre à prix affiché, en nombre limité, sans offre à durée limitée ni relance. Tout ce qu’elles donnent s’obtient aussi en jouant.
          </p>
        </div>
      </section>

      {lot !== null && etat && <FeuilleEchanger etat={etat} envoyer={acheter} initial={lot} onFermer={() => setLot(null)} />}
    </div>
  )
}

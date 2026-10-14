import { Icone } from './Icone'

interface Props {
  decouvertes: number
  onSauvegarder: () => void
  onFermer: () => void
}

/**
 * Relance « Sauvegardez votre progression » (I-32, ADR 0070) : une carte en
 * ligne sous la table, toujours refermable, jamais un dialogue. Ce que l'on
 * gagne, puis le risque, sans compte à rebours.
 */
export function RelanceCompte({ decouvertes, onSauvegarder, onFermer }: Props) {
  const gain =
    decouvertes > 1
      ? `${decouvertes} mots déjà trouvés. Avec une adresse électronique, retrouvez-les sur un autre appareil.`
      : decouvertes === 1
        ? '1 mot déjà trouvé. Avec une adresse électronique, retrouvez-le sur un autre appareil.'
        : 'Avec une adresse électronique, retrouvez votre partie sur un autre appareil.'
  return (
    <aside className="relance-compte" aria-labelledby="relance-titre">
      <div className="rangee rangee-ecartee">
        <span className="panel-k">Partie invitée</span>
        <button type="button" className="btn-icone" aria-label="Fermer" onClick={onFermer}>
          <Icone nom="fermer" />
        </button>
      </div>
      <h2 id="relance-titre">Sauvegardez votre progression</h2>
      <p>{gain}</p>
      <p className="relance-risque">Une partie invitée inactive pendant 6 mois est effacée.</p>
      <div className="rangee">
        <button type="button" className="btn btn-secondary" onClick={onSauvegarder}>
          Sauvegarder
        </button>
        <button type="button" className="btn-texte" onClick={onFermer}>
          Plus tard
        </button>
      </div>
    </aside>
  )
}

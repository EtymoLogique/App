import type { IssueFusion } from '../contrat'
import type { CatalogueJeu, Prevision } from '../services/jeu'
import { texteDuMot } from '../services/jeu'
import { Brique } from './Brique'

const RAISONS: Record<string, string> = {
  archaique: 'le mot est archaïque',
  rare: 'le mot est trop rare',
  offensant: 'le mot est offensant',
  analyse_non_etablie: 'son analyse n’est pas établie',
}

export type Retour =
  | { etat: 'prevision'; prevision: Prevision }
  | { etat: 'confirme'; issue: IssueFusion }
  | { etat: 'message'; texte: string }

interface Props {
  retour: Retour | null
  jeu: CatalogueJeu
  onOuvrirFiche: (motId: string) => void
}

function Message({ issue, jeu, onOuvrirFiche }: { issue: IssueFusion | Prevision } & Omit<Props, 'retour'>) {
  switch (issue.type) {
    case 'decouverte':
    case 'connue': {
      const mot = texteDuMot(jeu.cartes.get(issue.mot_id))
      return (
        <p>
          {issue.type === 'decouverte' ? <>Découverte : </> : <>Déjà dans votre codex : </>}
          <button type="button" className="lien" onClick={() => onOuvrirFiche(issue.mot_id)}>
            {mot}
          </button>
          {issue.type === 'connue' && <>. Rien n’est consommé.</>}
        </p>
      )
    }
    case 'presque':
      return (
        <p>
          {issue.motif === 'ordre'
            ? 'Presque ! Les bonnes briques, mais pas dans le bon ordre.'
            : 'Presque ! Il manque encore une brique.'}
        </p>
      )
    case 'exclue':
      return <p>Cette combinaison existe, mais elle n’est pas retenue : {RAISONS[issue.raison] ?? issue.raison}.</p>
    case 'reserve_insuffisante':
      return (
        <p>
          Il vous manque un exemplaire de{' '}
          {issue.briques.map((id) => {
            const brique = jeu.briques.get(id)
            return brique ? <Brique key={id} brique={brique} compacte /> : null
          })}
          . Les plis en apportent d’autres.
        </p>
      )
    case 'echec':
      return <p>Aucun mot ne naît de cette combinaison. Essayer ne coûte rien.</p>
  }
}

/** Retour de tentative (game-design) : la réponse du serveur remplace toujours la prévisualisation. */
export function Resultat({ retour, jeu, onOuvrirFiche }: Props) {
  return (
    <div className="resultat" role="status" aria-live="polite">
      {retour?.etat === 'message' && <p>{retour.texte}</p>}
      {retour?.etat === 'prevision' && (
        <div className="prevision">
          <Message issue={retour.prevision} jeu={jeu} onOuvrirFiche={onOuvrirFiche} />
          <p className="meta">En attente de confirmation…</p>
        </div>
      )}
      {retour?.etat === 'confirme' && <Message issue={retour.issue} jeu={jeu} onOuvrirFiche={onOuvrirFiche} />}
    </div>
  )
}

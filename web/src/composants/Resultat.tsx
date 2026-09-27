import type { IssueFusion } from '../contrat'
import type { CatalogueJeu, Prevision } from '../services/jeu'
import { texteDuMot } from '../services/jeu'
import { PetiteBrique } from './Brique'

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

type Ton = 'win' | 'hint' | 'fail' | 'known' | 'wait'

interface Props {
  retour: Retour | null
  jeu: CatalogueJeu
  onOuvrirFiche: (motId: string) => void
}

function Phrase({ issue, jeu, onOuvrirFiche }: { issue: IssueFusion | Prevision } & Omit<Props, 'retour'>): [Ton, React.ReactNode] {
  const mot = (id: string) => (
    <button type="button" className="btn-texte" onClick={() => onOuvrirFiche(id)}>
      {texteDuMot(jeu.cartes.get(id))}
    </button>
  )
  switch (issue.type) {
    case 'decouverte':
      return ['win', <>Nouvelle découverte : {mot(issue.mot_id)}&nbsp;!</>]
    case 'connue':
      return ['known', <>{mot(issue.mot_id)} est déjà dans votre codex. Aucun exemplaire utilisé.</>]
    case 'presque':
      return [
        'hint',
        issue.motif === 'ordre' ? 'Bonnes briques… mais l’ordre compte.' : 'Bonnes briques… mais il en manque une.',
      ]
    case 'exclue':
      return [
        'fail',
        `Ce mot existe, mais il n’est pas retenu : ${RAISONS[issue.raison] ?? issue.raison}. Rien n’est perdu.`,
      ]
    case 'reserve_insuffisante':
      return [
        'fail',
        <>
          Plus assez d’exemplaires de{' '}
          {issue.briques.map((id) => {
            const brique = jeu.briques.get(id)
            return brique ? <PetiteBrique key={id} brique={brique} /> : null
          })}
          . Ouvrez un pli pour en retrouver.
        </>,
      ]
    case 'echec':
      return ['fail', 'Aucune recette connue. Rien n’est perdu : vos exemplaires restent dans la réserve.']
  }
}

/**
 * Retour de tentative : cercle d'état et phrase courte, annoncés par
 * `aria-live` (design système 3.3). La réponse du serveur remplace toujours
 * la prévisualisation.
 */
export function Resultat({ retour, jeu, onOuvrirFiche }: Props) {
  let ton: Ton | undefined
  let contenu: React.ReactNode = null
  if (retour?.etat === 'message') {
    ton = 'fail'
    contenu = retour.texte
  } else if (retour?.etat === 'prevision') {
    ton = 'wait'
    contenu = (
      <>
        {Phrase({ issue: retour.prevision, jeu, onOuvrirFiche })[1]} <span className="sr-only">En attente de confirmation.</span>
      </>
    )
  } else if (retour?.etat === 'confirme') {
    ;[ton, contenu] = Phrase({ issue: retour.issue, jeu, onOuvrirFiche })
  }
  return (
    <p className="feedback" data-tone={ton} role="status" aria-live="polite">
      {contenu}
    </p>
  )
}

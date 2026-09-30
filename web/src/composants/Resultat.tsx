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
  | { etat: 'confirme'; issue: IssueFusion; /** Jalons atteints par une découverte, récompense à récupérer (ADR 0038, 0042). */ jalons?: string[] }
  | { etat: 'message'; texte: React.ReactNode; ton?: 'hint' | 'fail' }

type Ton = 'win' | 'hint' | 'fail' | 'known' | 'wait'

const NOMBRES = ['', 'Une', 'Deux', 'Trois']

interface Props {
  retour: Retour | null
  jeu: CatalogueJeu
  /** Briques posées : le message d'attente en dépend. */
  posees: number
  /** Raison pour laquelle la fusion est impossible maintenant, sinon `null`. */
  bloquee: string | null
  onInverser: () => void
  /** Mène aux quêtes, où attend la récompense d'un jalon atteint. */
  onQuetes: () => void
}

function Ligne({ ton, children }: { ton?: Ton; children: React.ReactNode }) {
  return (
    <p className="feedback" data-tone={ton}>
      {children}
    </p>
  )
}

/**
 * Retours d'une tentative (maquette I-10) : en ligne, à l'endroit de l'action,
 * aucun ne consomme d'exemplaire. Échec neutre, jamais de secousse punitive ;
 * « presque » propose un geste. Un mot trouvé, nouveau ou connu, ouvre sa carte :
 * ici ne reste qu'une ligne.
 */
export function Resultat({ retour, jeu, posees, bloquee, onInverser, onQuetes }: Props) {
  let contenu: React.ReactNode
  if (retour?.etat === 'message') {
    contenu = <Ligne ton={retour.ton ?? 'fail'}>{retour.texte}</Ligne>
  } else if (retour?.etat === 'prevision') {
    // Aucune découverte n'est annoncée avant la validation du serveur (interfaces, règle 05).
    contenu = <Ligne ton="wait">Vérification de votre hypothèse…</Ligne>
  } else if (retour?.etat === 'confirme') {
    const issue = retour.issue
    switch (issue.type) {
      case 'decouverte': {
        const gouttes = issue.gouttes ?? 0
        const jalon = (retour.jalons ?? []).length > 0
        contenu = (
          <div className="retour">
            <Ligne ton="win">
              Nouvelle découverte : {texteDuMot(jeu.cartes.get(issue.mot_id))}&nbsp;!
              {gouttes > 0 && ` +${gouttes}\u00a0goutte${gouttes > 1 ? 's' : ''} d’encre.`}
            </Ligne>
            {jalon && (
              <>
                <p className="panel-tip">Jalon atteint&nbsp;! Sa récompense vous attend dans les quêtes.</p>
                <div className="rangee">
                  <button type="button" className="btn btn-primary btn-s" onClick={onQuetes}>
                    Récupérer la récompense
                  </button>
                </div>
              </>
            )}
          </div>
        )
        break
      }
      case 'presque':
        contenu = (
          <div className="retour">
            <Ligne ton="hint">
              <b>Presque.</b>
            </Ligne>
            <p className="panel-tip">
              {issue.motif === 'ordre'
                ? 'Ces briques vont ensemble, mais pas dans cet ordre. Rien n’est perdu.'
                : 'Ces briques vont ensemble, mais il en manque une. Rien n’est perdu.'}
            </p>
            {issue.motif === 'ordre' && (
              <div className="rangee">
                <button type="button" className="btn btn-secondary btn-s" onClick={onInverser}>
                  Inverser
                </button>
              </div>
            )}
          </div>
        )
        break
      case 'connue':
        contenu = (
          <Ligne ton="known">
            <b>Déjà découvert.</b> Rien n’est consommé.
          </Ligne>
        )
        break
      case 'exclue':
        contenu = (
          <Ligne ton="fail">
            Ce mot existe, mais il n’est pas retenu : {RAISONS[issue.raison] ?? issue.raison}. Rien n’est perdu.
          </Ligne>
        )
        break
      case 'reserve_insuffisante':
        contenu = (
          <Ligne ton="hint">
            Plus assez d’exemplaires de{' '}
            {issue.briques.map((id) => {
              const brique = jeu.briques.get(id)
              return brique ? <PetiteBrique key={id} brique={brique} /> : null
            })}
            . Ouvrez un pli pour en retrouver.
          </Ligne>
        )
        break
      case 'echec':
        contenu = <Ligne ton="fail">Aucune recette connue. Rien n’est perdu : essayez autre chose.</Ligne>
        break
    }
  } else if (bloquee && posees > 0) {
    contenu = <Ligne>{bloquee}</Ligne>
  } else {
    contenu = (
      <Ligne>
        {posees === 0
          ? 'Posez deux briques dans l’ordre de votre choix.'
          : posees === 1
            ? 'Posez une deuxième brique.'
            : `${NOMBRES[posees] ?? posees} briques posées. L’ordre compte : glissez pour réordonner.`}
      </Ligne>
    )
  }
  return (
    <div className="retours" role="status" aria-live="polite">
      {contenu}
    </div>
  )
}

export type { Prevision }

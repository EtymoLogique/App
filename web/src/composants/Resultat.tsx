import type { IssueFusion } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import type { CatalogueJeu, Prevision } from '../services/jeu'
import { texteDuMot } from '../services/jeu'
import { PetiteBrique } from './Brique'
import { MotSegmente } from './MotSegmente'

const RAISONS: Record<string, string> = {
  archaique: 'le mot est archaïque',
  rare: 'le mot est trop rare',
  offensant: 'le mot est offensant',
  analyse_non_etablie: 'son analyse n’est pas établie',
}

export type Retour =
  | { etat: 'prevision'; prevision: Prevision }
  | { etat: 'confirme'; issue: IssueFusion }
  | { etat: 'message'; texte: React.ReactNode; ton?: 'hint' | 'fail' }

type Ton = 'win' | 'hint' | 'fail' | 'known' | 'wait'

const NOMBRES = ['', 'Une', 'Deux', 'Trois']

interface Props {
  retour: Retour | null
  jeu: CatalogueJeu
  entrees: EntreeCodex[]
  /** Briques posées : le message d'attente en dépend. */
  posees: number
  /** Raison pour laquelle la fusion est impossible maintenant, sinon `null`. */
  bloquee: string | null
  onInverser: () => void
  onVoirCarte: (motId: string) => void
  onVider: () => void
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
 * « presque » propose un geste ; « déjà découvert » rappelle la fiche.
 */
export function Resultat({ retour, jeu, entrees, posees, bloquee, onInverser, onVoirCarte, onVider }: Props) {
  let contenu: React.ReactNode
  if (retour?.etat === 'message') {
    contenu = <Ligne ton={retour.ton ?? 'fail'}>{retour.texte}</Ligne>
  } else if (retour?.etat === 'prevision') {
    // Aucune découverte n'est annoncée avant la validation du serveur (interfaces, règle 05).
    contenu = <Ligne ton="wait">Vérification de votre hypothèse…</Ligne>
  } else if (retour?.etat === 'confirme') {
    const issue = retour.issue
    switch (issue.type) {
      case 'decouverte':
        contenu = <Ligne ton="win">Nouvelle découverte : {texteDuMot(jeu.cartes.get(issue.mot_id))}&nbsp;!</Ligne>
        break
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
      case 'connue': {
        const entree = entrees.find((e) => e.id === issue.mot_id)
        const carte = jeu.cartes.get(issue.mot_id)
        const composition = carte?.compositions?.find((c) => c.preferee) ?? carte?.compositions?.[0]
        const morceaux = [...(composition?.parties ?? [])]
          .sort((a, b) => a.rang - b.rang)
          .flatMap((p) => {
            const nature = jeu.cartes.get(p.unite_id)?.nature
            return p.segment_debut != null && p.segment_fin != null && nature ? [{ debut: p.segment_debut, fin: p.segment_fin, nature }] : []
          })
        contenu = (
          <>
            <Ligne ton="known">
              <b>Déjà découvert.</b> Rien n’est consommé.
            </Ligne>
            <div className="retour">
              <div className="rangee rangee-ecartee">
                <span className="retour-mot">
                  <MotSegmente mot={texteDuMot(carte)} morceaux={morceaux} />
                </span>
                {entree && <span className="mono">N°&nbsp;{String(entree.n).padStart(3, '0')}</span>}
              </div>
              {entree?.definition && <p className="panel-tip">{entree.definition}</p>}
              <div className="rangee">
                <button type="button" className="btn btn-secondary btn-s" onClick={() => onVoirCarte(issue.mot_id)}>
                  Voir la carte
                </button>
                <button type="button" className="btn-texte" onClick={onVider}>
                  Vider la table
                </button>
              </div>
            </div>
          </>
        )
        break
      }
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

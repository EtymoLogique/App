import { Fragment, useLayoutEffect, useRef, useState } from 'react'

import type { IssueFusion } from '../contrat'
import { mouvementReduit } from '../services/animation'
import type { BriqueJeu, CatalogueJeu, Prevision, TrompeJeu } from '../services/jeu'
import { texteDuMot } from '../services/jeu'
import { PetiteBrique } from './Brique'

const RAISONS: Record<string, string> = {
  archaique: 'le mot est archaïque',
  offensant: 'le mot est offensant',
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
  /** Jalons dont la récompense attend encore d'être récupérée (état confirmé du serveur). */
  aRecuperer: ReadonlySet<string>
  /** Mène aux quêtes, où attend la récompense d'un jalon atteint. */
  onQuetes: () => void
  /** Briques posées sur la table, dans l'ordre : l'explication d'un homographe en désigne une par son rang. */
  briquesPosees: string[]
  /** Mots au codex : l'explication complète d'un trompe-l'œil attend la découverte du mot (ADR 0052). */
  decouverts: ReadonlySet<string>
  /** Ouvre la carte d'une unité dans le codex. */
  onCarte: (uniteId: string) => void
  /** Retire la brique de ce rang et ouvre la réserve sur sa forme. */
  onRemplacer: (rang: number, forme: string) => void
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
export function Resultat({ retour, jeu, posees, bloquee, onInverser, aRecuperer, onQuetes, briquesPosees, decouverts, onCarte, onRemplacer }: Props) {
  let contenu: React.ReactNode
  // Ce que dit le retour : quand elle change, l'ancien message sort et le nouveau entre.
  const cle = retour?.etat === 'confirme' ? `confirme:${retour.issue.type}${retour.issue.type === 'echec' && retour.issue.explication ? `:${retour.issue.explication.nature}` : ''}` : retour?.etat === 'message' ? `message:${typeof retour.texte === 'string' ? retour.texte : ''}` : (retour?.etat ?? `attente:${bloquee && posees > 0 ? 'bloquee' : posees}`)
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
        const jalon = (retour.jalons ?? []).some((id) => aRecuperer.has(id))
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
      case 'echec': {
        const explication = issue.explication
        const homographe = explication?.nature === 'homographe' ? jeu.briques.get(briquesPosees[explication.rang] ?? '') : undefined
        const piege = explication?.nature === 'trompe_l_oeil' ? jeu.trompesLOeil.find((t) => t.id === explication.trompe_l_oeil_id) : undefined
        if (explication?.nature === 'homographe' && homographe) {
          contenu = <MauvaisHomographe brique={homographe} rang={explication.rang} onCarte={onCarte} onRemplacer={onRemplacer} />
        } else if (piege) {
          contenu = <FaussePiste piege={piege} jeu={jeu} lisible={piege.motId === null || decouverts.has(piege.motId)} onCarte={onCarte} />
        } else {
          contenu = <Ligne ton="fail">Aucune recette connue. Rien n’est perdu : essayez autre chose.</Ligne>
        }
        break
      }
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
  return <Releve cle={cle} contenu={contenu} />
}

/**
 * « Bonne forme, autre brique » (ADR 0052) : la brique posée a un homographe qui donnerait une
 * recette. On ne nomme pas la bonne ; on propose de remplacer celle-ci, la réserve ouverte sur sa forme.
 */
function MauvaisHomographe({ brique, rang, onCarte, onRemplacer }: { brique: BriqueJeu; rang: number; onCarte: (uniteId: string) => void; onRemplacer: (rang: number, forme: string) => void }) {
  return (
    <div className="retour">
      <Ligne ton="hint">
        <b>Bonne forme, autre brique.</b>
      </Ligne>
      <p className="panel-tip">
        <PetiteBrique brique={brique} onOuvrir={() => onCarte(brique.uniteId)} />
        {brique.glose && <> «&nbsp;{brique.glose}&nbsp;»</>} ne convient pas ici. Une autre brique s’écrit aussi{' '}
        <PetiteBrique brique={brique} onOuvrir={() => onRemplacer(rang, brique.libelle)} titre={`Voir les briques ${brique.libelle}`} />, avec un autre sens. Rien n’est perdu.
      </p>
      <div className="rangee">
        <button type="button" className="btn btn-secondary btn-s" onClick={() => onRemplacer(rang, brique.libelle)}>
          Voir les briques {brique.libelle}
        </button>
      </div>
    </div>
  )
}

/**
 * « Fausse piste » (ADR 0052) : les lettres se suivent, le mot n'en vient pas. L'explication
 * courte ne nomme jamais le mot ; la complète se lit une fois le mot au codex.
 */
function FaussePiste({ piege, jeu, lisible, onCarte }: { piege: TrompeJeu; jeu: CatalogueJeu; lisible: boolean; onCarte: (uniteId: string) => void }) {
  const [ouverte, setOuverte] = useState(false)
  const briques = piege.combinaison.map((id) => jeu.briques.get(id))
  return (
    <div className="retour">
      <Ligne ton="hint">
        <b>Fausse piste.</b>
      </Ligne>
      <p className="panel-tip">
        {briques.map((b, i) =>
          b ? (
            <Fragment key={b.id}>
              {i > 0 && <span className="bplus"> + </span>}
              <PetiteBrique brique={b} onOuvrir={() => onCarte(b.uniteId)} />
            </Fragment>
          ) : null,
        )}
        {piege.courte && <>&nbsp;: {piege.courte}</>} Rien n’est perdu.
      </p>
      {lisible && piege.complete ? (
        <>
          <div className="rangee">
            <button type="button" className="btn btn-secondary btn-s" aria-expanded={ouverte} onClick={() => setOuverte((o) => !o)}>
              Pourquoi&nbsp;?
            </button>
          </div>
          {ouverte && <p className="panel-tip">{piege.complete}</p>}
        </>
      ) : (
        <p className="panel-tip">L’explication complète se lira une fois ce mot trouvé.</p>
      )}
    </div>
  )
}

/** Relève de message : l'ancien retour sort par le haut pendant que le nouveau entre par le bas (240 ms). */
function Releve({ cle, contenu }: { cle: string; contenu: React.ReactNode }) {
  const dernier = useRef({ cle, contenu })
  const [sortant, setSortant] = useState<{ cle: string; contenu: React.ReactNode } | null>(null)
  useLayoutEffect(() => {
    const avant = dernier.current
    if (avant.cle === cle || mouvementReduit()) return
    setSortant(avant)
    const minuteur = setTimeout(() => setSortant(null), 240)
    return () => clearTimeout(minuteur)
  }, [cle])
  // Après l'effet de relève : il lit le message précédent avant qu'il ne soit remplacé.
  useLayoutEffect(() => {
    dernier.current = { cle, contenu }
  })
  const releve = sortant !== null && sortant.cle !== cle
  return (
    <div className="retours" role="status" aria-live="polite">
      {releve && (
        <div key={`sort-${sortant.cle}`} className="sort" aria-hidden="true" inert>
          {sortant.contenu}
        </div>
      )}
      <div key={cle} className={releve ? 'entre' : undefined}>
        {contenu}
      </div>
    </div>
  )
}

export type { Prevision }

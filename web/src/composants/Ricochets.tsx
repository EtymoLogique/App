import { type KeyboardEvent, type ReactNode, useCallback, useMemo, useRef, useState } from 'react'

import type { Etat, QuestionRicochet, ReponseRicochet, SeanceRicochets } from '../contrat'
import type { CatalogueJeu } from '../services/jeu'
import {
  type DonneesRicochets,
  type FormatRicochet,
  type ReponseJoueur,
  cartesTrouvees,
  donneesRicochets,
  juger,
  longueurDuMot,
  melanger,
  morceauxDuMot,
  motCoupe,
  motDe,
  propositionsDeCoupe,
  retour,
  sensLitteral,
} from '../services/ricochets'
import { Brique, PetiteBrique } from './Brique'
import { MotSegmente } from './MotSegmente'
import { useDialogue } from './useDialogue'

type Envoi = Promise<ReponseRicochet | { erreur: string }>

interface Props {
  jeu: CatalogueJeu | null
  etat: Etat | null
  enLigne: boolean
  seance: () => Promise<SeanceRicochets | { erreur: string }>
  repondre: (format: FormatRicochet, unite: string, reponse: ReponseJoueur) => Envoi
}

const HORS_LIGNE = 'Hors ligne. Le codex se consulte ; les ricochets reprennent avec le réseau.'

const FORMATS: Record<FormatRicochet, string> = {
  sens_brique: 'Sens d’une brique',
  brique_sens: 'Brique d’un sens',
  mot_sens: 'Sens littéral',
  decouper: 'Découper',
  paires: 'Paires',
}

/** Une carte, telle qu'au codex : la brique en brique (jamais en texte brut), le mot en serif. */
function Carte({ jeu, id }: { jeu: CatalogueJeu; id: string }) {
  const brique = jeu.briques.get(id)
  return brique ? <PetiteBrique brique={brique} /> : <span className="rico-mot-court">{motDe(jeu, id)}</span>
}

/** La brique sans sa glose, quand la glose est la réponse. */
function BriqueSansGlose({ jeu, id, taille }: { jeu: CatalogueJeu; id: string; taille?: 's' }) {
  const b = jeu.briques.get(id)
  return b ? <Brique brique={{ ...b, glose: null }} taille={taille} /> : null
}

/** Rond de choix : vide, coché (bonne réponse) ou barré (pas celle-ci). Jamais la couleur seule. */
function Rond({ etat }: { etat: '' | 'juste' | 'rate' }) {
  return (
    <svg className="rico-rond" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      {etat === 'juste' && <path d="M7.5 12.5l3 3 6-6.5" />}
      {etat === 'rate' && <path d="M8 12h8" />}
    </svg>
  )
}

/** Flèches haut et bas : d'un choix à l'autre (Entrée ou Espace répond, comme tout bouton). */
function naviguerAuClavier(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const boutons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
  const i = boutons.indexOf(document.activeElement as HTMLButtonElement)
  const suivant = boutons[(i + (e.key === 'ArrowDown' ? 1 : -1) + boutons.length) % boutons.length]
  if (suivant) {
    e.preventDefault()
    suivant.focus()
  }
}

interface Choix {
  cle: string
  contenu: ReactNode
  reponse: ReponseJoueur
}

interface Question {
  /** Ce qu'on interroge, en grand : la brique, le mot ou le sens. */
  sujet: ReactNode
  consigne: string
  choix: Choix[]
  /** Ce que la bonne réponse apprend, montré au verdict. */
  lecon: ReactNode
}

function preparer(q: QuestionRicochet, jeu: CatalogueJeu, d: DonneesRicochets): Question {
  const cible = q.cartes[0] ?? ''
  const options = q.choix ?? []
  const glose = d.gloses.get(d.briques.get(cible)?.sens ?? '') ?? '…'
  const guillemets = (texte: string) => `« ${texte} »`
  switch (q.format) {
    case 'sens_brique':
      return {
        sujet: <BriqueSansGlose jeu={jeu} id={cible} />,
        consigne: 'Que veut dire cette brique ?',
        choix: options.map((s) => ({ cle: s, contenu: guillemets(d.gloses.get(s) ?? '…'), reponse: s })),
        lecon: (
          <>
            <Carte jeu={jeu} id={cible} /> veut dire {guillemets(glose)}.
          </>
        ),
      }
    case 'brique_sens':
      return {
        sujet: <span className="rico-sens">{guillemets(glose)}</span>,
        consigne: 'Quelle brique a ce sens ?',
        choix: options.map((b) => ({ cle: b, contenu: <BriqueSansGlose jeu={jeu} id={b} taille="s" />, reponse: b })),
        lecon: (
          <>
            <Carte jeu={jeu} id={cible} /> veut dire {guillemets(glose)}.
          </>
        ),
      }
    case 'mot_sens': {
      const litteral = sensLitteral(jeu, cible) ?? '…'
      return {
        sujet: <span className="rico-sens">{guillemets(litteral)}</span>,
        consigne: 'Quel mot a ce sens littéral ?',
        choix: options.map((m) => ({ cle: m, contenu: motDe(jeu, m), reponse: m })),
        lecon: `${motDe(jeu, cible)} veut dire, mot à mot, ${guillemets(litteral)}.`,
      }
    }
    default: {
      const mot = motDe(jeu, cible)
      const propositions = propositionsDeCoupe(d.mots.get(cible)?.coupes ?? [], longueurDuMot(jeu, cible))
      return {
        sujet: <span className="rico-mot">{mot}</span>,
        consigne: 'Où ce mot se coupe-t-il ?',
        choix: propositions.map((c) => ({ cle: c.join(), contenu: motCoupe(mot, c), reponse: c })),
        lecon: (
          <>
            Le mot se coupe ainsi :{' '}
            <span className="rico-segmente">
              <MotSegmente mot={mot} morceaux={morceauxDuMot(jeu, cible)} />
            </span>
          </>
        ),
      }
    }
  }
}

interface QuestionProps {
  q: QuestionRicochet
  jeu: CatalogueJeu
  d: DonneesRicochets
  envoyer: (format: FormatRicochet, unite: string, reponse: ReponseJoueur) => void
  /** Signale que la question a reçu sa réponse : « Suivant » apparaît. */
  repondu: () => void
}

/** QCM et découper : un toucher répond, le verdict est immédiat. */
function Qcm({ q, jeu, d, envoyer, repondu }: QuestionProps) {
  const question = useMemo(() => preparer(q, jeu, d), [q, jeu, d])
  const [touche, setTouche] = useState<string | null>(null)
  const unite = q.cartes[0] ?? ''
  const juste = (c: Choix) => juger(d, q.format, unite, c.reponse) === true
  const repondre = (c: Choix) => {
    if (touche !== null) return
    setTouche(c.cle)
    envoyer(q.format, unite, c.reponse)
    repondu()
  }
  const choisi = question.choix.find((c) => c.cle === touche)
  return (
    <>
      <div className="rico-sujet">{question.sujet}</div>
      <h2 className="rico-consigne" tabIndex={-1} ref={(e) => e?.focus({ preventScroll: true })}>
        {question.consigne}
      </h2>
      <div className="rico-choix" role="group" aria-label="Réponses possibles" onKeyDown={naviguerAuClavier}>
        {question.choix.map((c) => {
          const etat = touche === null ? '' : juste(c) ? 'juste' : c.cle === touche ? 'rate' : ''
          return (
            <button key={c.cle} type="button" className={`rico-option ${etat}`} disabled={touche !== null && etat === ''} onClick={() => repondre(c)}>
              <Rond etat={etat} />
              <span className="rico-option-texte">{c.contenu}</span>
              {etat === 'juste' && <span className="rico-etiquette">La bonne réponse</span>}
              {etat === 'rate' && <span className="rico-etiquette">Pas celle-ci</span>}
            </button>
          )
        })}
      </div>
      <div className="rico-verdict" role="status" aria-live="polite" ref={(e) => (choisi ? e?.scrollIntoView({ block: 'nearest' }) : undefined)}>
        {choisi && (
          <>
            <strong>{juste(choisi) ? 'Bien vu.' : 'Pas cette fois.'}</strong>
            <span>{question.lecon}</span>
          </>
        )}
      </div>
    </>
  )
}

/** Paires : une brique puis son sens ; une paire fausse se défait ; reliée après un essai manqué, la brique compte comme manquée. */
function Paires({ q, jeu, d, envoyer, repondu }: QuestionProps) {
  const sens = useMemo(() => melanger(q.cartes.map((b) => d.briques.get(b)?.sens ?? '')), [q, d])
  const [choisie, setChoisie] = useState<string | null>(null)
  const [liens, setLiens] = useState<Map<string, string>>(new Map())
  const [manquees, setManquees] = useState<Map<string, string>>(new Map())
  const [rate, setRate] = useState<string | null>(null)
  const relier = (s: string) => {
    if (!choisie) return
    if (juger(d, 'paires', choisie, s)) {
      const suite = new Map(liens).set(choisie, s)
      setLiens(suite)
      setRate(null)
      // Premier essai : le sens juste ; sinon le premier sens tenté, qui compte comme manqué.
      envoyer('paires', choisie, manquees.get(choisie) ?? s)
      if (suite.size === q.cartes.length) repondu()
    } else {
      if (!manquees.has(choisie)) setManquees(new Map(manquees).set(choisie, s))
      setRate(s)
    }
    setChoisie(null)
  }
  const numero = (b: string) => [...liens.keys()].indexOf(b) + 1
  const briqueDe = (s: string) => [...liens.entries()].find(([, v]) => v === s)?.[0]
  const termine = liens.size === q.cartes.length
  return (
    <>
      <h2 className="rico-consigne" tabIndex={-1} ref={(e) => e?.focus({ preventScroll: true })}>
        Reliez chaque brique à son sens.
      </h2>
      <div className="rico-paires">
        <div className="rico-choix" role="group" aria-label="Briques" onKeyDown={naviguerAuClavier}>
          {q.cartes.map((b) => {
            const n = numero(b)
            const manquee = n > 0 && manquees.has(b)
            return (
              <button
                key={b}
                type="button"
                className={['rico-option', 'rico-paire', choisie === b && 'prise', n > 0 && 'relie', manquee && 'manquee'].filter(Boolean).join(' ')}
                disabled={n > 0}
                aria-pressed={choisie === b}
                onClick={() => {
                  setRate(null)
                  setChoisie(b)
                }}
              >
                <BriqueSansGlose jeu={jeu} id={b} taille="s" />
                {n > 0 && (
                  <span className="rico-numero" aria-label={`paire ${n}${manquee ? ', manquée' : ''}`}>
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="rico-choix" role="group" aria-label="Sens" onKeyDown={naviguerAuClavier}>
          {sens.map((s) => {
            const b = briqueDe(s)
            const n = b ? numero(b) : 0
            return (
              <button
                key={s}
                type="button"
                className={['rico-option', 'rico-paire', n > 0 && 'relie', b && manquees.has(b) && 'manquee', rate === s && 'rate'].filter(Boolean).join(' ')}
                disabled={n > 0 || !choisie}
                onClick={() => relier(s)}
              >
                <span className="rico-option-texte">«&nbsp;{d.gloses.get(s) ?? '…'}&nbsp;»</span>
                {n > 0 && (
                  <span className="rico-numero" aria-hidden="true">
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="rico-verdict" role="status" aria-live="polite">
        {rate ? (
          <>
            <strong>Pas cette paire.</strong>
            <span>La brique comptera comme manquée ; trouvez son sens.</span>
          </>
        ) : termine ? (
          <>
            <strong>Toutes les paires sont faites.</strong>
            {manquees.size > 0 && <span>Les paires en pointillé comptent comme manquées.</span>}
          </>
        ) : null}
      </div>
    </>
  )
}

type Reponses = Map<string, ReponseRicochet | { erreur: string }>

/** Fin de séance : pas de score, chaque carte, son résultat et son retour confirmé par le serveur. */
function Recapitulatif({ jeu, reponses }: { jeu: CatalogueJeu; reponses: Reponses }) {
  const lignes = [...reponses.entries()]
  const cartes = lignes.flatMap(([id, r]) => ('carte' in r ? [{ id, r }] : []))
  const erreurs = lignes.length - cartes.length
  const maitrisees = cartes.filter(({ r }) => r.juste && r.carte.maitrisee && r.carte.bonnes_niveau_3 === 3)
  const presque = cartes.filter(({ r }) => r.carte.niveau === 3 && !r.carte.maitrisee && r.carte.bonnes_niveau_3 === 2)
  return (
    <>
      <h2 className="rico-consigne" tabIndex={-1} ref={(e) => e?.focus({ preventScroll: true })}>
        Séance terminée.
      </h2>
      {maitrisees.map(({ id }) => (
        <p key={id} className="rico-annonce">
          <Carte jeu={jeu} id={id} /> est maîtrisée. Elle reviendra tous les 7 jours au plus.
        </p>
      ))}
      {presque.map(({ id }) => (
        <p key={id} className="rico-annonce">
          Dans 7 jours, un ricochet juste et la carte <Carte jeu={jeu} id={id} /> sera maîtrisée.
        </p>
      ))}
      <ul className="rico-recap">
        {cartes.map(({ id, r }) => (
          <li key={id} className={r.juste ? '' : 'manquee'}>
            <Rond etat={r.juste ? 'juste' : 'rate'} />
            <span className="sr-only">{r.juste ? 'Juste :' : 'Manquée :'}</span>
            <Carte jeu={jeu} id={id} />
            <span className="rico-retour">{retour(r.carte)}</span>
          </li>
        ))}
      </ul>
      {erreurs > 0 && <p className="rico-note">{erreurs > 1 ? `${erreurs} réponses n’ont pas pu être enregistrées : elles ne comptent pas.` : 'Une réponse n’a pas pu être enregistrée : elle ne compte pas.'}</p>}
    </>
  )
}

type Phase = { t: 'question'; i: number; repondu: boolean } | { t: 'attente' } | { t: 'fin' }

interface SeanceProps {
  jeu: CatalogueJeu
  d: DonneesRicochets
  questions: QuestionRicochet[]
  envoyer: QuestionProps['envoyer']
  reponses: Reponses
  envois: React.RefObject<Envoi[]>
  encore: () => void
  onFermer: () => void
}

/** La séance, en modale : plein écran sur mobile, panneau centré sur ordinateur. */
function Seance({ jeu, d, questions, envoyer, reponses, envois, encore, onFermer }: SeanceProps) {
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer)
  const [phase, setPhase] = useState<Phase>({ t: 'question', i: 0, repondu: false })
  const q = phase.t === 'question' ? questions[phase.i] : undefined
  const i = phase.t === 'question' ? phase.i : questions.length
  const repondu = useCallback(() => setPhase((p) => (p.t === 'question' ? { ...p, repondu: true } : p)), [])
  const suivant = () => {
    if (phase.t !== 'question') return
    if (phase.i + 1 < questions.length) return setPhase({ t: 'question', i: phase.i + 1, repondu: false })
    // Le récapitulatif attend que le serveur ait confirmé chaque réponse.
    setPhase({ t: 'attente' })
    void Promise.all(envois.current).then(() => setPhase({ t: 'fin' }))
  }
  return (
    <div className="scrim">
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue rico-seance" role="dialog" aria-modal="true" aria-labelledby="rico-titre">
        <header className="rico-tete">
          <button type="button" className="rico-fermer" aria-label="Fermer la séance" onClick={fermer}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <h1 id="rico-titre">Ricochets</h1>
          <span className="rico-compte">{phase.t === 'question' ? `${i + 1} / ${questions.length}` : ''}</span>
        </header>
        <p className="rico-points" aria-hidden="true">
          {questions.map((_, k) => (
            <span key={k} className={k < i ? 'fait' : k === i ? 'en-cours' : ''} />
          ))}
        </p>
        <div className="rico-corps">
          {q && phase.t === 'question' && (
            <>
              <p className="rico-format">{FORMATS[q.format]}</p>
              {q.format === 'paires' ? (
                <Paires key={phase.i} q={q} jeu={jeu} d={d} envoyer={envoyer} repondu={repondu} />
              ) : (
                <Qcm key={phase.i} q={q} jeu={jeu} d={d} envoyer={envoyer} repondu={repondu} />
              )}
            </>
          )}
          {phase.t === 'attente' && (
            <p className="rico-note" role="status">
              Enregistrement des réponses…
            </p>
          )}
          {phase.t === 'fin' && <Recapitulatif jeu={jeu} reponses={reponses} />}
        </div>
        <footer className="rico-pied">
          {phase.t === 'question' && !phase.repondu && <p className="rico-note">{q?.format === 'paires' ? 'Touchez une brique, puis son sens.' : 'Touchez la bonne réponse.'}</p>}
          {phase.t === 'question' && phase.repondu && (
            <button type="button" className="btn btn-primary" onClick={suivant}>
              {phase.i + 1 === questions.length ? 'Terminer' : 'Suivant'}
            </button>
          )}
          {phase.t === 'fin' && (
            <>
              <button type="button" className="btn btn-primary" onClick={encore}>
                Encore cinq
              </button>
              <button type="button" className="btn btn-secondary" onClick={fermer}>
                Fermer
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}

export function Ricochets({ jeu, etat, enLigne, seance, repondre }: Props) {
  const [questions, setQuestions] = useState<QuestionRicochet[] | null>(null)
  const [tirage, setTirage] = useState(0)
  const [chargement, setChargement] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reponses, setReponses] = useState<Reponses>(new Map())
  const envois = useRef<Envoi[]>([])
  const d = useMemo(() => (jeu ? donneesRicochets(jeu) : null), [jeu])
  const fermer = useCallback(() => setQuestions(null), [])

  const commencer = async () => {
    setChargement(true)
    setMessage(null)
    const resultat = await seance()
    setChargement(false)
    if ('erreur' in resultat) return setMessage(resultat.erreur)
    if (resultat.questions.length === 0) return setMessage('Pas encore assez de cartes pour une séance : trouvez d’autres mots ou briques.')
    envois.current = []
    setReponses(new Map())
    setTirage((n) => n + 1)
    setQuestions(resultat.questions)
  }

  const envoyer = (format: FormatRicochet, unite: string, reponse: ReponseJoueur) => {
    const envoi = repondre(format, unite, reponse)
    envois.current.push(envoi)
    void envoi.then((r) => setReponses((anciennes) => new Map(anciennes).set(unite, r)))
  }

  if (!jeu || !d) return <p className="rico-note">Le catalogue se charge…</p>
  const trouvees = etat ? cartesTrouvees(d, etat) : []
  const maitrisees = new Set(etat?.ricochets?.filter((r) => r.maitrisee).map((r) => r.unite_id))
  const nMaitrisees = trouvees.filter((c) => maitrisees.has(c)).length
  return (
    <div className="ricochets">
      <p className="rico-intro">
        Cinq questions sur les cartes que vous avez trouvées. Une bonne réponse fait revenir la carte plus tard ; trois au plus haut niveau, et elle est maîtrisée. Rien n’est consommé.
      </p>
      {trouvees.length > 0 && (
        <p className="rico-jauge">
          <strong>{nMaitrisees}</strong> / {trouvees.length} cartes maîtrisées
        </p>
      )}
      <button type="button" className="btn btn-primary" disabled={!enLigne || !etat || chargement} onClick={() => void commencer()}>
        {chargement ? 'Tirage…' : 'Faire des ricochets'}
      </button>
      {!enLigne && <p className="rico-note">{HORS_LIGNE}</p>}
      {message && <p className="rico-note">{message}</p>}
      {questions && <Seance key={tirage} jeu={jeu} d={d} questions={questions} envoyer={envoyer} reponses={reponses} envois={envois} encore={() => void commencer()} onFermer={fermer} />}
    </div>
  )
}

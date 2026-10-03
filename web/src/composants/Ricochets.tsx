import { type ReactNode, useMemo, useRef, useState } from 'react'

import type { CarteRicochet, Etat, QuestionRicochet, ReponseRicochet, SeanceRicochets } from '../contrat'
import type { CatalogueJeu } from '../services/jeu'
import {
  type DonneesRicochets,
  type FormatRicochet,
  type ReponseJoueur,
  donneesRicochets,
  juger,
  longueurDuMot,
  melanger,
  motCoupe,
  motDe,
  propositionsDeCoupe,
  retour,
  sensLitteral,
} from '../services/ricochets'
import { Brique } from './Brique'
import { Icone } from './Icone'

type Envoi = Promise<ReponseRicochet | { erreur: string }>

interface Props {
  jeu: CatalogueJeu | null
  etat: Etat | null
  enLigne: boolean
  seance: () => Promise<SeanceRicochets | { erreur: string }>
  repondre: (format: FormatRicochet, unite: string, reponse: ReponseJoueur) => Envoi
}

const HORS_LIGNE = 'Hors ligne. Le codex se consulte ; les ricochets reprennent avec le réseau.'

/** Une carte, nommée comme au codex : la brique avec son trait d'union, le mot en toutes lettres. */
function nomCarte(jeu: CatalogueJeu, id: string): string {
  return jeu.briques.get(id)?.libelle ?? motDe(jeu, id)
}

interface Choix {
  cle: string
  contenu: ReactNode
  reponse: ReponseJoueur
}

function choixDe(q: QuestionRicochet, jeu: CatalogueJeu, d: DonneesRicochets): { enonce: ReactNode; choix: Choix[] } {
  const cible = q.cartes[0] ?? ''
  const options = q.choix ?? []
  const brique = jeu.briques.get(cible)
  // La glose est la réponse : la brique s'affiche sans elle.
  const sansGlose = (id: string) => {
    const b = jeu.briques.get(id)
    return b ? <Brique brique={{ ...b, glose: null }} /> : null
  }
  switch (q.format) {
    case 'sens_brique':
      return {
        enonce: <>Que veut dire cette brique ? {brique && sansGlose(cible)}</>,
        choix: options.map((s) => ({ cle: s, contenu: d.gloses.get(s) ?? '…', reponse: s })),
      }
    case 'brique_sens': {
      const glose = d.gloses.get(d.briques.get(cible)?.sens ?? '')
      return {
        enonce: <>Quelle brique veut dire «&nbsp;{glose}&nbsp;» ?</>,
        choix: options.map((b) => ({ cle: b, contenu: sansGlose(b), reponse: b })),
      }
    }
    case 'mot_sens':
      return {
        enonce: <>Quel mot veut dire «&nbsp;{sensLitteral(jeu, cible)}&nbsp;» ?</>,
        choix: options.map((m) => ({ cle: m, contenu: motDe(jeu, m), reponse: m })),
      }
    default: {
      const mot = motDe(jeu, cible)
      const propositions = propositionsDeCoupe(d.mots.get(cible)?.coupes ?? [], longueurDuMot(jeu, cible))
      return {
        enonce: (
          <>
            Où couper ce mot ? <strong className="rico-mot">{mot}</strong>
          </>
        ),
        choix: propositions.map((c) => ({ cle: c.join(), contenu: motCoupe(mot, c), reponse: c })),
      }
    }
  }
}

interface QuestionProps {
  q: QuestionRicochet
  jeu: CatalogueJeu
  d: DonneesRicochets
  envoyer: (format: FormatRicochet, unite: string, reponse: ReponseJoueur) => void
  suivant: () => void
  dernier: boolean
}

/** QCM, découper : un toucher répond, le verdict est immédiat, un seul bouton « Suivant ». */
function Qcm({ q, jeu, d, envoyer, suivant, dernier }: QuestionProps) {
  const { enonce, choix } = useMemo(() => choixDe(q, jeu, d), [q, jeu, d])
  const [touche, setTouche] = useState<string | null>(null)
  const unite = q.cartes[0] ?? ''
  const juste = (c: Choix) => juger(d, q.format, unite, c.reponse) === true
  const repondre = (c: Choix) => {
    if (touche !== null) return
    setTouche(c.cle)
    envoyer(q.format, unite, c.reponse)
  }
  const choisi = choix.find((c) => c.cle === touche)
  return (
    <>
      <h2 className="rico-enonce" tabIndex={-1} ref={(e) => e?.focus({ preventScroll: true })}>
        {enonce}
      </h2>
      <div className="rico-choix" role="group" aria-label="Réponses possibles">
        {choix.map((c) => {
          const etatChoix = touche === null ? '' : juste(c) ? 'juste' : c.cle === touche ? 'rate' : ''
          return (
            <button key={c.cle} type="button" className={`rico-choix-bouton ${etatChoix}`} disabled={touche !== null && etatChoix === ''} aria-disabled={touche !== null} onClick={() => repondre(c)}>
              <span>{c.contenu}</span>
              {etatChoix === 'juste' && <Verdict texte="La bonne réponse" />}
              {etatChoix === 'rate' && <Verdict texte="Pas celle-ci" />}
            </button>
          )
        })}
      </div>
      <p className="rico-verdict" role="status" aria-live="polite">
        {choisi && (juste(choisi) ? 'La bonne réponse.' : 'Pas celle-ci. La bonne réponse est cochée.')}
      </p>
      {touche !== null && (
        <button type="button" className="btn btn-primary" ref={(e) => e?.scrollIntoView({ block: 'nearest' })} onClick={suivant}>
          {dernier ? 'Terminer' : 'Suivant'}
        </button>
      )}
    </>
  )
}

function Verdict({ texte }: { texte: string }) {
  return (
    <span className="rico-etiquette">
      <Icone nom={texte === 'La bonne réponse' ? 'coche' : 'info'} />
      {texte}
    </span>
  )
}

/** Paires : une brique puis un sens ; une paire fausse se défait ; reliée après un essai manqué, la brique compte comme manquée. */
function Paires({ q, jeu, d, envoyer, suivant, dernier }: QuestionProps) {
  const sens = useMemo(() => melanger(q.cartes.map((b) => d.briques.get(b)?.sens ?? '')), [q, d])
  const [choisie, setChoisie] = useState<string | null>(null)
  const [liens, setLiens] = useState<Map<string, string>>(new Map())
  const [essais, setEssais] = useState<Map<string, string>>(new Map())
  const [rate, setRate] = useState<string | null>(null)
  const termine = liens.size === q.cartes.length
  const relier = (s: string) => {
    if (!choisie) return
    if (juger(d, 'paires', choisie, s)) {
      setLiens(new Map(liens).set(choisie, s))
      // Premier essai : le sens juste ; sinon le premier sens tenté, qui compte comme manqué.
      envoyer('paires', choisie, essais.get(choisie) ?? s)
      setChoisie(null)
    } else {
      if (!essais.has(choisie)) setEssais(new Map(essais).set(choisie, s))
      setRate(s)
      setChoisie(null)
    }
  }
  const numero = (b: string) => [...liens.keys()].indexOf(b) + 1
  const numeroSens = (s: string) => numero([...liens.entries()].find(([, v]) => v === s)?.[0] ?? '')
  return (
    <>
      <h2 className="rico-enonce" tabIndex={-1} ref={(e) => e?.focus({ preventScroll: true })}>
        Relier chaque brique à son sens
      </h2>
      <div className="rico-paires">
        <div className="rico-colonne" role="group" aria-label="Briques">
          {q.cartes.map((b) => {
            const brique = jeu.briques.get(b)
            const n = numero(b)
            return (
              <button key={b} type="button" className={`rico-choix-bouton ${choisie === b ? 'prise' : ''} ${n ? 'relie' : ''}`} disabled={n > 0} aria-pressed={choisie === b} onClick={() => { setRate(null); setChoisie(b) }}>
                {brique && <Brique brique={{ ...brique, glose: null }} />}
                {n > 0 && <span className="rico-numero">{n}</span>}
              </button>
            )
          })}
        </div>
        <div className="rico-colonne" role="group" aria-label="Sens">
          {sens.map((s) => {
            const n = numeroSens(s)
            return (
              <button key={s} type="button" className={`rico-choix-bouton ${n ? 'relie' : ''} ${rate === s ? 'rate' : ''}`} disabled={n > 0 || !choisie} onClick={() => relier(s)}>
                <span>{d.gloses.get(s) ?? '…'}</span>
                {n > 0 && <span className="rico-numero">{n}</span>}
                {rate === s && <Verdict texte="Pas celle-ci" />}
              </button>
            )
          })}
        </div>
      </div>
      <p className="rico-verdict" role="status" aria-live="polite">
        {termine ? 'Toutes les paires sont reliées.' : choisie ? 'Touchez son sens.' : 'Touchez une brique.'}
      </p>
      {termine && (
        <button type="button" className="btn btn-primary" ref={(e) => e?.scrollIntoView({ block: 'nearest' })} onClick={suivant}>
          {dernier ? 'Terminer' : 'Suivant'}
        </button>
      )}
    </>
  )
}

type Reponses = Map<string, ReponseRicochet | { erreur: string }>

/** Fin de séance : pas de score, chaque carte et son retour confirmé par le serveur. */
function Recapitulatif({ jeu, reponses, encore, fermer }: { jeu: CatalogueJeu; reponses: Reponses; encore: () => void; fermer: () => void }) {
  const lignes = [...reponses.entries()]
  const cartes = lignes.flatMap(([id, r]) => ('carte' in r ? [{ id, carte: r.carte as CarteRicochet }] : []))
  const erreurs = lignes.filter(([, r]) => 'erreur' in r).length
  return (
    <>
      <h2 className="rico-enonce" tabIndex={-1} ref={(e) => e?.focus({ preventScroll: true })}>
        Séance terminée
      </h2>
      <ul className="rico-recap">
        {cartes.map(({ id, carte }) => (
          <li key={id}>
            <span className="rico-carte">{nomCarte(jeu, id)}</span>
            <span className="rico-retour">{retour(carte)}</span>
            {carte.niveau === 3 && !carte.maitrisee && carte.bonnes_niveau_3 === 2 && (
              <span className="rico-annonce">
                {`Dans 7 jours, un ricochet juste et la carte ${nomCarte(jeu, id)} sera maîtrisée.`}
              </span>
            )}
            {carte.maitrisee && carte.bonnes_niveau_3 === 3 && <span className="rico-annonce">Maîtrisée.</span>}
          </li>
        ))}
      </ul>
      {erreurs > 0 && <p className="rico-verdict">{`${erreurs} réponse${erreurs > 1 ? 's' : ''} n’${erreurs > 1 ? 'ont' : 'a'} pas pu être enregistrée${erreurs > 1 ? 's' : ''}.`}</p>}
      <div className="rico-actions">
        <button type="button" className="btn btn-primary" onClick={encore}>
          Encore cinq
        </button>
        <button type="button" className="btn btn-secondary" onClick={fermer}>
          Fermer
        </button>
      </div>
    </>
  )
}

type Phase = { t: 'accueil' } | { t: 'chargement' } | { t: 'question'; i: number } | { t: 'fin' }

export function Ricochets({ jeu, etat, enLigne, seance, repondre }: Props) {
  const [phase, setPhase] = useState<Phase>({ t: 'accueil' })
  const [questions, setQuestions] = useState<QuestionRicochet[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [reponses, setReponses] = useState<Reponses>(new Map())
  const envois = useRef<Envoi[]>([])
  const d = useMemo(() => (jeu ? donneesRicochets(jeu) : null), [jeu])
  const maitrisees = etat?.ricochets?.filter((r) => r.maitrisee).length ?? 0

  const commencer = async () => {
    setPhase({ t: 'chargement' })
    setMessage(null)
    const tirage = await seance()
    if ('erreur' in tirage) {
      setMessage(tirage.erreur)
      setPhase({ t: 'accueil' })
    } else if (tirage.questions.length === 0) {
      setMessage('Pas assez de cartes pour une séance. Trouvez d’autres mots ou briques.')
      setPhase({ t: 'accueil' })
    } else {
      envois.current = []
      setReponses(new Map())
      setQuestions(tirage.questions)
      setPhase({ t: 'question', i: 0 })
    }
  }

  const envoyer = (format: FormatRicochet, unite: string, reponse: ReponseJoueur) => {
    const envoi = repondre(format, unite, reponse)
    envois.current.push(envoi)
    void envoi.then((r) => setReponses((anciennes) => new Map(anciennes).set(unite, r)))
  }

  const suivant = (i: number) => {
    if (i + 1 < questions.length) return setPhase({ t: 'question', i: i + 1 })
    // Le récapitulatif attend que le serveur ait confirmé chaque réponse.
    setPhase({ t: 'chargement' })
    void Promise.all(envois.current).then(() => setPhase({ t: 'fin' }))
  }

  if (!jeu || !d) return <p className="rico-verdict">Le catalogue se charge…</p>
  const q = phase.t === 'question' ? questions[phase.i] : undefined
  return (
    <div className="ricochets">
      {phase.t === 'accueil' && (
        <>
          <p className="rico-intro">Cinq questions sur vos cartes, sans chronomètre ni note. Rien n’est consommé.</p>
          {maitrisees > 0 && <p className="rico-intro">{`${maitrisees} carte${maitrisees > 1 ? 's' : ''} maîtrisée${maitrisees > 1 ? 's' : ''}.`}</p>}
          <button type="button" className="btn btn-primary" disabled={!enLigne || !etat} onClick={() => void commencer()}>
            Faire des ricochets
          </button>
          {!enLigne && <p className="rico-verdict">{HORS_LIGNE}</p>}
          {message && <p className="rico-verdict">{message}</p>}
        </>
      )}
      {phase.t === 'chargement' && <p className="rico-verdict" role="status">Un instant…</p>}
      {q && phase.t === 'question' && (
        <section aria-label={`Question ${phase.i + 1} sur ${questions.length}`}>
          <p className="rico-points" aria-label={`Question ${phase.i + 1} sur ${questions.length}`}>
            {questions.map((_, k) => (
              <span key={k} className={k < phase.i ? 'fait' : k === phase.i ? 'en-cours' : ''} aria-hidden="true" />
            ))}
          </p>
          {q.format === 'paires' ? (
            <Paires key={phase.i} q={q} jeu={jeu} d={d} envoyer={envoyer} suivant={() => suivant(phase.i)} dernier={phase.i + 1 === questions.length} />
          ) : (
            <Qcm key={phase.i} q={q} jeu={jeu} d={d} envoyer={envoyer} suivant={() => suivant(phase.i)} dernier={phase.i + 1 === questions.length} />
          )}
        </section>
      )}
      {phase.t === 'fin' && <Recapitulatif jeu={jeu} reponses={reponses} encore={() => void commencer()} fermer={() => setPhase({ t: 'accueil' })} />}
    </div>
  )
}

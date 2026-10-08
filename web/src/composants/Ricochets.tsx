import { type CSSProperties, createContext, useContext, type KeyboardEvent, type ReactNode, useCallback, useMemo, useRef, useState } from 'react'

import type { Etat, QuestionRicochet, ReponseRicochet, SeanceRicochets } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import { type CatalogueJeu, NATURES } from '../services/jeu'
import {
  type DonneesRicochets,
  type FormatRicochet,
  type ReponseJoueur,
  cartesTrouvees,
  donneesRicochets,
  juger,
  melanger,
  briquesDuMot,
  morceauxDuMot,
  motDe,
  retour,
  sensLitteral,
} from '../services/ricochets'
import { mouvementReduit } from '../services/animation'
import { Brique, PetiteBrique } from './Brique'
import { CarteSeule } from './Codex'
import { Decoupe } from './Decoupe'
import { MotSegmente } from './MotSegmente'

type Envoi = Promise<ReponseRicochet | { erreur: string }>

interface Props {
  jeu: CatalogueJeu | null
  etat: Etat | null
  enLigne: boolean
  seance: () => Promise<SeanceRicochets | { erreur: string }>
  repondre: (format: FormatRicochet, unite: string, reponse: ReponseJoueur) => Envoi
  /** Cartes du codex : celles qu'un verdict ou le récapitulatif ouvre. */
  entrees: EntreeCodex[]
  lireMedia: (chemin: string) => Promise<string>
  onSuivreLien: (id: string) => void
}

/** Ouvre la carte d'une unité (brique ou mot) ; absent hors séance. */
const OuvrirCarte = createContext<(id: string) => void>(() => undefined)

/** Rend cliquable ce qui nomme une carte déjà trouvée : un toucher l'ouvre. */
function Ouvrable({ id, children }: { id: string; children: ReactNode }) {
  const ouvrir = useContext(OuvrirCarte)
  return (
    <button
      type="button"
      className="rico-ouvrir"
      aria-label="Ouvrir la carte"
      onClick={(e) => {
        // Repère d'où la carte grossit et où elle revient.
        document.querySelector('[data-rico-origine]')?.removeAttribute('data-rico-origine')
        e.currentTarget.setAttribute('data-rico-origine', '')
        ouvrir(id)
      }}
    >
      {children}
    </button>
  )
}

const HORS_LIGNE = 'Hors ligne. Le codex se consulte ; les ricochets reprennent avec le réseau.'

/** Une carte, telle qu'au codex : la brique en brique (jamais en texte brut), le mot en serif. */
function Carte({ jeu, id }: { jeu: CatalogueJeu; id: string }) {
  const brique = jeu.briques.get(id)
  return <Ouvrable id={brique?.uniteId ?? id}>{brique ? <PetiteBrique brique={brique} /> : <span className="bchip" data-kind={NATURES.mot}>{motDe(jeu, id)}</span>}</Ouvrable>
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
        lecon: (
          <>
            <Carte jeu={jeu} id={cible} /> veut dire, mot à mot, {guillemets(litteral)}.
          </>
        ),
      }
    }
    default: {
      const mot = motDe(jeu, cible)
      const morceaux = (d.mots.get(cible)?.coupes.length ?? 1) + 1
      const parties = morceauxDuMot(jeu, cible)
      return {
        sujet: <span className="rico-mot">{mot}</span>,
        consigne: morceaux === 2 ? 'Où ce mot se coupe-t-il ?' : `Coupez ce mot en ${morceaux} morceaux.`,
        choix: [],
        lecon: (
          <>
            Le mot se coupe ainsi :{' '}
            <Ouvrable id={cible}>
              <span className="rico-segmente">
                <MotSegmente mot={mot} morceaux={parties} />
              </span>
            </Ouvrable>
            {/* Les briques élémentaires et leur sens : de quoi apprendre, juste ou pas. */}
            <ul className="rico-briques">
              {briquesDuMot(jeu, cible).map((b) => (
                <li key={b.id}>
                  <Ouvrable id={b.uniteId}>
                    <Brique brique={b} taille="s" />
                  </Ouvrable>
                </li>
              ))}
            </ul>
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
      <h2 className="rico-consigne" tabIndex={-1} ref={(e) => e?.focus({ preventScroll: true })}>
        {question.consigne}
      </h2>
      <div className="rico-sujet">{question.sujet}</div>
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

/** Découper : le mot en grand ; une lame se cale sur les jointures, « Couper ici » pose la coupe, « Valider » envoie la réponse (ADR 0053). */
function DecoupeQuestion({ q, jeu, d, envoyer, repondu, pied }: QuestionProps & { pied: HTMLElement | null }) {
  const question = useMemo(() => preparer(q, jeu, d), [q, jeu, d])
  const unite = q.cartes[0] ?? ''
  const reels = useMemo(() => morceauxDuMot(jeu, unite), [jeu, unite])
  return (
    <Decoupe
      mot={motDe(jeu, unite)}
      attendu={d.mots.get(unite)?.coupes ?? []}
      reels={reels}
      consigne={question.consigne}
      lecon={question.lecon}
      juger={(coupes) => juger(d, 'decouper', unite, coupes)}
      onValider={(coupes) => envoyer('decouper', unite, coupes)}
      repondu={repondu}
      pied={pied}
    />
  )
}

/**
 * Paires : on relie librement chaque brique à un sens, dans un sens ou dans l'autre (touchée de nouveau, une paire se refait),
 * puis on valide. Rien n'est jugé avant : après validation, les paires justes en Encre, les fausses
 * en pointillé, et le bon sens de chaque brique ratée pour apprendre.
 */
function Paires({ q, jeu, d, envoyer, repondu }: QuestionProps) {
  const sens = useMemo(() => melanger(q.cartes.map((b) => d.briques.get(b)?.sens ?? '')), [q, d])
  // Premier élément touché, d'une colonne ou de l'autre ; le second, dans l'autre colonne, fait la paire.
  const [choisie, setChoisie] = useState<{ cote: 'brique' | 'sens'; id: string } | null>(null)
  const [liens, setLiens] = useState<Map<string, string>>(new Map())
  const [valide, setValide] = useState(false)
  const relier = (b: string, s: string) => {
    // Un sens ne va qu'à une brique : il quitte son ancienne paire.
    const suite = new Map([...liens].filter(([, v]) => v !== s))
    setLiens(suite.set(b, s))
    setChoisie(null)
  }
  const toucher = (cote: 'brique' | 'sens', id: string) => {
    if (choisie && choisie.cote !== cote) return cote === 'brique' ? relier(id, choisie.id) : relier(choisie.id, id)
    setChoisie(choisie?.id === id ? null : { cote, id })
  }
  const pris = (id: string) => choisie?.id === id
  const valider = () => {
    setValide(true)
    for (const [b, s] of liens) envoyer('paires', b, s)
    repondu()
  }
  const juste = (b: string) => juger(d, 'paires', b, liens.get(b) ?? '') === true
  const etat = (b: string | undefined) => (!b || !liens.has(b) ? '' : !valide ? 'relie' : juste(b) ? 'juste' : 'rate')
  // Numéro fixe par brique : le même des deux côtés, sans bouger quand une paire se refait.
  const numero = (b: string) => q.cartes.indexOf(b) + 1
  const briqueDe = (s: string) => [...liens.entries()].find(([, v]) => v === s)?.[0]
  const ratees = q.cartes.filter((b) => valide && !juste(b))
  return (
    <>
      <h2 className="rico-consigne" tabIndex={-1} ref={(e) => e?.focus({ preventScroll: true })}>
        Reliez chaque brique à son sens.
      </h2>
      <div className="rico-paires" style={{ '--rico-lignes': q.cartes.length } as CSSProperties}>
        <div className="rico-choix" role="group" aria-label="Briques" onKeyDown={naviguerAuClavier}>
          {q.cartes.map((b) => (
            <button
              key={b}
              type="button"
              className={['rico-option', 'rico-paire', pris(b) && 'prise', etat(b)].filter(Boolean).join(' ')}
              disabled={valide}
              aria-pressed={pris(b)}
              onClick={() => toucher('brique', b)}
            >
              <BriqueSansGlose jeu={jeu} id={b} taille="s" />
              {liens.has(b) && (
                <span className="rico-numero" aria-label={`paire ${numero(b)}`}>
                  {numero(b)}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="rico-choix" role="group" aria-label="Sens" onKeyDown={naviguerAuClavier}>
          {sens.map((s) => {
            const b = briqueDe(s)
            return (
              <button
                key={s}
                type="button"
                className={['rico-option', 'rico-paire', pris(s) && 'prise', etat(b)].filter(Boolean).join(' ')}
                disabled={valide}
                aria-pressed={pris(s)}
                onClick={() => toucher('sens', s)}
              >
                <span className="rico-option-texte">«&nbsp;{d.gloses.get(s) ?? '…'}&nbsp;»</span>
                {b && (
                  <span className="rico-numero" aria-hidden="true">
                    {numero(b)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      {!valide && <p className="rico-note rico-aide">Touchez une brique et son sens, dans l’ordre que vous voulez.</p>}
      {!valide && liens.size === q.cartes.length && (
        <button type="button" className="btn btn-primary rico-valider" onClick={valider}>
          Valider les paires
        </button>
      )}
      <div className="rico-verdict" role="status" aria-live="polite">
        {valide && (
          <>
            <strong>{ratees.length === 0 ? 'Toutes les paires sont justes.' : 'Pas toutes justes.'}</strong>
            {ratees.map((b) => (
              <span key={b}>
                <Carte jeu={jeu} id={b} /> veut dire «&nbsp;{d.gloses.get(d.briques.get(b)?.sens ?? '') ?? '…'}&nbsp;».
              </span>
            ))}
          </>
        )}
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

/** La séance, dans l'onglet : elle remplace l'accueil jusqu'à sa fermeture. */
function Seance({ jeu, d, questions, envoyer, reponses, envois, encore, onFermer }: SeanceProps) {
  const [phase, setPhase] = useState<Phase>({ t: 'question', i: 0, repondu: false })
  const [pied, setPied] = useState<HTMLElement | null>(null)
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
    <section className="rico-seance" aria-label="Séance de ricochets">
      <header className="rico-tete">
        <button type="button" className="rico-fermer" aria-label="Fermer la séance" onClick={onFermer}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <p className="rico-points" aria-hidden="true">
          {questions.map((_, k) => (
            <span key={k} className={k < i ? 'fait' : k === i ? 'en-cours' : ''} />
          ))}
        </p>
        <span className="rico-compte">{phase.t === 'question' ? `${i + 1} / ${questions.length}` : ''}</span>
      </header>
      <div className="rico-corps">
        {q && phase.t === 'question' && (
          <>
            {q.format === 'paires' ? (
              <Paires key={phase.i} q={q} jeu={jeu} d={d} envoyer={envoyer} repondu={repondu} />
            ) : q.format === 'decouper' ? (
              <DecoupeQuestion key={phase.i} q={q} jeu={jeu} d={d} envoyer={envoyer} repondu={repondu} pied={pied} />
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
      <footer className="rico-pied" ref={setPied}>
        {phase.t === 'question' && !phase.repondu && q?.format !== 'paires' && q?.format !== 'decouper' && <p className="rico-note">Touchez la bonne réponse.</p>}
        {phase.t === 'question' && phase.repondu && (
          <button type="button" className="btn btn-primary" onClick={suivant}>
            {phase.i + 1 === questions.length ? 'Terminer' : 'Suivant'}
          </button>
        )}
        {phase.t === 'fin' && (
          <>
            <button type="button" className="btn btn-secondary" onClick={onFermer}>
              Fermer
            </button>
            <button type="button" className="btn btn-primary" onClick={encore}>
              Encore cinq
            </button>
          </>
        )}
      </footer>
    </section>
  )
}

/** Trajectoire du galet : quatre rebonds de plus en plus courts, puis il coule. */
const TRAJET = 'M20 60Q100-30 180 130Q250 50 320 130Q370 80 420 130Q455 100 490 130Q510 115 530 130'
/** Points d'impact sur l'eau et instant (fraction du cycle) où le galet les touche, à vitesse constante. */
const IMPACTS = [
  { x: 180, t: 0.194, r: 34 },
  { x: 320, t: 0.341, r: 28 },
  { x: 420, t: 0.443, r: 22 },
  { x: 490, t: 0.512, r: 16 },
  { x: 530, t: 0.55, r: 40 },
]
const CYCLE = '4.5s'

/** Ronds dans l'eau à un impact : deux cercles qui s'élargissent et s'effacent. */
function Ronds({ x, t, r, anime }: { x: number; t: number; r: number; anime: boolean }) {
  return [0, 0.04].map((d) => {
    const debut = t + d
    const fin = debut + 0.22
    return (
      <ellipse key={d} className="rico-rond-eau" cx={x} cy={130} rx={anime ? 0 : r * (d ? 0.6 : 1)} ry={anime ? 0 : r * (d ? 0.15 : 0.25)} opacity={anime ? 0 : 0.35}>
        {anime && (
          <>
            <animate attributeName="rx" values={`0;0;${r};${r}`} keyTimes={`0;${debut};${fin};1`} dur={CYCLE} repeatCount="indefinite" />
            <animate attributeName="ry" values={`0;0;${r / 4};${r / 4}`} keyTimes={`0;${debut};${fin};1`} dur={CYCLE} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes={`0;${debut};${debut + 0.005};${fin};1`} dur={CYCLE} repeatCount="indefinite" />
          </>
        )}
      </ellipse>
    )
  })
}

/** Accueil : un galet ricoche sur l'eau, en boucle ; figé, sa trace seule, en mouvement réduit. */
function Ricochet() {
  const anime = !mouvementReduit()
  return (
    <svg className="rico-scene" viewBox="0 0 560 170" aria-hidden="true" focusable="false">
      <path className="rico-trace" d={TRAJET} />
      <path className="rico-eau" d="M0 130q35-6 70 0t70 0 70 0 70 0 70 0 70 0 70 0 70 0" />
      <path className="rico-eau rico-eau-2" d="M20 148q35-5 70 0t70 0 70 0 70 0 70 0 70 0 70 0" />
      <path className="rico-eau rico-eau-3" d="M60 162q35-4 70 0t70 0 70 0 70 0 70 0" />
      {IMPACTS.map((i) => (
        <Ronds key={i.x} {...i} anime={anime} />
      ))}
      <g transform={anime ? undefined : 'translate(100 15) rotate(-20)'} opacity={anime ? 0 : 1}>
        <ellipse className="rico-galet-ombre" cx={2} cy={3} rx={13} ry={7} />
        <ellipse className="rico-galet" rx={13} ry={7} />
        {anime && (
          <>
            <animateMotion path={TRAJET} rotate="auto" keyPoints="0;1;1" keyTimes="0;0.55;1" calcMode="linear" dur={CYCLE} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.03;0.55;0.56;1" dur={CYCLE} repeatCount="indefinite" />
          </>
        )}
      </g>
    </svg>
  )
}

export function Ricochets({ jeu, etat, enLigne, seance, repondre, entrees, lireMedia, onSuivreLien }: Props) {
  const [questions, setQuestions] = useState<QuestionRicochet[] | null>(null)
  const [tirage, setTirage] = useState(0)
  const [chargement, setChargement] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reponses, setReponses] = useState<Reponses>(new Map())
  const envois = useRef<Envoi[]>([])
  const d = useMemo(() => (jeu ? donneesRicochets(jeu) : null), [jeu])
  const fermer = useCallback(() => setQuestions(null), [])
  const [ouverte, setOuverte] = useState<string | null>(null)
  const entree = ouverte ? entrees.find((e) => e.id === ouverte && e.trouvee) : undefined

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
  if (questions)
    return (
      <OuvrirCarte.Provider value={setOuverte}>
        <Seance key={tirage} jeu={jeu} d={d} questions={questions} envoyer={envoyer} reponses={reponses} envois={envois} encore={() => void commencer()} onFermer={fermer} />
        {entree && (
          <CarteSeule
            key={entree.id}
            origine="[data-rico-origine]"
            entree={entree}
            entrees={entrees}
            jeu={jeu}
            lireMedia={lireMedia}
            onFermer={() => setOuverte(null)}
            onSuivreLien={(id) => {
              setOuverte(null)
              fermer()
              onSuivreLien(id)
            }}
          />
        )}
      </OuvrirCarte.Provider>
    )
  return (
    <div className="ricochets">
      <Ricochet />
      <p className="rico-intro">
        Zone d’apprentissage. Cinq questions sur les cartes trouvées, pour retenir le sens de leurs briques. Une erreur ne coûte rien ; une carte bien sue devient maîtrisée.
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
    </div>
  )
}

import { type CSSProperties, type PointerEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { memesCoupes } from '../services/ricochets'
import { jointureInitiale, jointureLaPlusProche, jointureVoisine } from '../services/decoupe'
import { type BriqueJeu, NATURES } from '../services/jeu'

interface Props {
  mot: string
  /** Découpes justes (une seule, sauf si le mot se coupe de plusieurs façons) : le joueur doit les poser toutes. */
  attendues: number[][]
  /** Variantes tout aussi justes de la première découpe (lettre partagée : « hom|onyme », « homo|nyme ») : l'une d'elles suffit. */
  equivalentes?: number[][]
  /** Nature de chaque morceau juste, dans l'ordre (pour colorer le verdict). */
  reels: { nature: BriqueJeu['nature'] }[]
  consigne: string
  /** Ce que la bonne réponse apprend, montré au verdict. */
  lecon: ReactNode
  /** Verdict d'une réponse validée ; `null` : la donnée manque. */
  juger: (reponse: number[][]) => boolean | null
  /** Une seule fois, à la dernière coupe posée : la commande part. Une découpe unique part à plat, plusieurs ensemble. */
  onValider: (reponse: number[] | number[][]) => void
  /** Signale que la question a reçu sa réponse : « Suivant » apparaît. */
  repondu: () => void
  /** Pied de séance : les commandes y sont posées, collées au-dessus de la navigation. */
  pied: HTMLElement | null
}

/** Rond de verdict : coché (juste) ou barré (pas celui-ci). La couleur ne dit jamais seule. */
function Rond({ juste }: { juste: boolean }) {
  return (
    <svg className="rico-rond" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      {juste ? <path d="M7.5 12.5l3 3 6-6.5" /> : <path d="M8 12h8" />}
    </svg>
  )
}

const Chevron = ({ sens }: { sens: 'g' | 'd' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={sens === 'g' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
)

/**
 * Découper (ADR 0053) : une lame se cale sur les jointures du mot, le mot s'écarte à son niveau, « Couper ici » pose la coupe,
 * la dernière coupe posée valide la réponse. Rien n'est jugé avant. Le verdict déroule les morceaux comme avant.
 */
export function Decoupe({ mot, attendues, equivalentes = [], reels, consigne, lecon, juger, onValider, repondu, pied }: Props) {
  const lettres = Array.from(mot)
  const n = lettres.length
  // Les coupes dans l'ordre où le joueur les a posées : « Reprendre » retire la dernière.
  const [posees, setPosees] = useState<number[]>([])
  // Découpes justes déjà posées, et la tentative fausse qui a clos la question, s'il y en a une.
  const [trouvees, setTrouvees] = useState<number[][]>([])
  const [faute, setFaute] = useState<number[] | null>(null)
  const plusieurs = attendues.length > 1
  const correspond = (a: number[], c: number[]) => memesCoupes(a, c) || (a === attendues[0] && equivalentes.some((e) => memesCoupes(e, c)))
  const restantes = attendues.filter((a) => !trouvees.some((t) => correspond(a, t)))
  const [curseur, setCurseur] = useState<number | null>(() => jointureInitiale(n, [], attendues[0] ?? []))
  const [appuye, setAppuye] = useState(false)
  const [valide, setValide] = useState(false)
  const [positions, setPositions] = useState<number[]>([])
  const zone = useRef<HTMLDivElement>(null)
  const motRef = useRef<HTMLSpanElement>(null)

  const coupes = [...posees].sort((a, b) => a - b)
  const ouvert = !valide && curseur !== null

  // Position de chaque jointure : au milieu de l'espace entre deux lettres. offsetLeft ignore les transformations (l'écart sous la lame).
  const mesurer = useCallback(() => {
    const ls = motRef.current?.children
    if (!ls) return
    const xs = [0]
    for (let k = 1; k < ls.length; k++) {
      const a = ls[k - 1] as HTMLElement
      const b = ls[k] as HTMLElement
      xs[k] = (a.offsetLeft + a.offsetWidth + b.offsetLeft) / 2
    }
    setPositions((anciennes) => (anciennes.length === xs.length && anciennes.every((v, i) => v === xs[i]) ? anciennes : xs))
  }, [])
  useLayoutEffect(mesurer, [mesurer, posees, mot])
  useEffect(() => {
    const el = zone.current
    if (!el) return
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(mesurer) : null
    obs?.observe(el)
    void document.fonts?.ready.then(mesurer)
    return () => obs?.disconnect()
  }, [mesurer])

  const viser = (clientX: number) => {
    const gauche = zone.current?.getBoundingClientRect().left ?? 0
    const j = jointureLaPlusProche(positions, clientX - gauche, coupes)
    if (j === null || j === curseur) return
    setCurseur(j)
    navigator.vibrate?.(8)
  }
  const poser = () => {
    if (curseur === null || valide) return
    ajouter(curseur)
  }
  // Une découpe juste est gardée et on passe à la suivante ; la dernière valide la réponse.
  // Sans découpe juste, la réponse est fausse dès que le nombre de coupes du plus long reste atteint.
  const ajouter = (j: number) => {
    const suite = [...posees, j].sort((a, b) => a - b)
    setAppuye(false)
    const juste = restantes.find((r) => correspond(r, suite))
    const maxi = Math.max(...restantes.map((r) => r.length))
    if (!juste && suite.length < maxi) {
      setPosees([...posees, j])
      return setCurseur(jointureInitiale(n, suite, restantes[0] ?? []))
    }
    if (juste && restantes.length > 1) {
      const suivantes = restantes.filter((r) => r !== juste)
      setTrouvees([...trouvees, suite])
      setPosees([])
      return setCurseur(jointureInitiale(n, [], suivantes[0] ?? []))
    }
    setPosees([...posees, j])
    const toutes = juste ? [...trouvees, suite] : trouvees
    if (juste) setTrouvees(toutes)
    else setFaute(suite)
    setValide(true)
    const reponse = [...toutes, ...(juste ? [] : [suite])]
    onValider(plusieurs ? reponse : suite)
    repondu()
  }
  const reprendre = () => {
    const derniere = posees[posees.length - 1]
    if (valide || derniere === undefined) return
    setPosees(posees.slice(0, -1))
    setCurseur(derniere)
  }
  const avancer = (sens: 1 | -1) => curseur !== null && setCurseur(jointureVoisine(curseur, sens, n, posees))

  const surAppui = (e: PointerEvent<HTMLDivElement>) => {
    if (valide) return
    setAppuye(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Pas de capture (pointeur synthétique ou déjà relâché) : le glissement reste pris par la zone.
    }
    viser(e.clientX)
  }
  const surMouvement = (e: PointerEvent<HTMLDivElement>) => {
    if (valide) return
    if (appuye) viser(e.clientX)
  }
  const relacher = () => setAppuye(false)
  const surTouche = (e: KeyboardEvent<HTMLDivElement>) => {
    if (valide) return
    const action: Record<string, () => void> = {
      ArrowLeft: () => avancer(-1),
      ArrowRight: () => avancer(1),
      Enter: poser,
      ' ': poser,
      Backspace: reprendre,
    }
    const faire = action[e.key]
    if (!faire) return
    e.preventDefault()
    faire()
  }

  // Validé : le mot devient des briques. Justes, elles prennent leur vraie nature ; sinon préfixe, mot, suffixe selon leur place.
  const juste = valide && faute === null && juger(trouvees) === true
  const morceauxDe = (decoupe: number[], reelle: boolean) => {
    const bornes = [0, ...decoupe, n]
    return bornes.slice(1).map((fin, i, tous) => {
      const nature = (reelle && reels.length === tous.length && correspond(attendues[0] ?? [], decoupe) ? reels[i]?.nature : undefined) ?? (i === 0 ? 'prefixe' : i === tous.length - 1 ? 'suffixe' : 'mot')
      return { nature, texte: lettres.slice(bornes[i], fin).join('') }
    })
  }
  // Ce que montre le verdict : chaque découpe juste, puis la fausse.
  const affichees = [...trouvees.map((decoupe) => ({ decoupe, juste: true })), ...(faute ? [{ decoupe: faute, juste: false }] : [])]

  const nombre = restantes[0]?.length ?? 1
  const statut = plusieurs
    ? `Découpe ${trouvees.length + 1} sur ${attendues.length}${trouvees.length > 0 ? ` (déjà trouvée${trouvees.length > 1 ? 's' : ''} : ${trouvees.map((t) => morceauxDe(t, false).map((m) => m.texte).join(' | ')).join(' ; ')})` : ''}. Glissez sur le mot, puis touchez « Couper ici ».`
    : nombre === 1
      ? 'Glissez sur le mot, puis touchez « Couper ici ».'
      : `Coupe ${posees.length + 1} sur ${nombre}. Glissez sur le mot.`
  const commandes = (
    <>
      <p className="rico-statut" role="status" aria-live="polite">
        {statut}
      </p>
      {(nombre > 1 || plusieurs) && (
        <button type="button" className="btn btn-secondary rico-reprendre" disabled={posees.length === 0} aria-label="Reprendre la dernière coupe" onClick={reprendre}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h10a6 6 0 010 12h-3" />
          </svg>
          Reprendre
        </button>
      )}
      <div className="rico-commandes">
        <button type="button" className="btn btn-secondary rico-pas" aria-label="Une lettre vers la gauche" onClick={() => avancer(-1)}>
          <Chevron sens="g" />
        </button>
        <button type="button" className="btn btn-primary" onClick={poser}>
          Couper ici
        </button>
        <button type="button" className="btn btn-secondary rico-pas" aria-label="Une lettre vers la droite" onClick={() => avancer(1)}>
          <Chevron sens="d" />
        </button>
      </div>
    </>
  )

  return (
    <>
      <h2 className="rico-consigne" tabIndex={-1} ref={(e) => e?.focus({ preventScroll: true })}>
        {consigne}
      </h2>
      <div className="rico-sujet">
        {valide ? (
          affichees.map(({ decoupe, juste: bonne }, k) => (
            <span key={k} className={`rico-mot rico-morceaux ${bonne ? 'juste' : 'faux'}`} lang="fr">
              {morceauxDe(decoupe, bonne).map((m, i, tous) => (
                // --d : de combien d'écarts le morceau revient vers le centre au départ, d'où il s'écarte.
                <span key={i} className="rico-morceau" data-kind={NATURES[m.nature]} style={{ '--d': (tous.length - 1) / 2 - i } as CSSProperties}>
                  <svg className="rico-contour" aria-hidden="true" focusable="false">
                    <rect width="100%" height="100%" rx="12" pathLength={1} />
                  </svg>
                  {m.nature === 'suffixe' && <span className="rico-tiret">-</span>}
                  {m.texte}
                  {m.nature === 'prefixe' && <span className="rico-tiret">-</span>}
                </span>
              ))}
            </span>
          ))
        ) : (
          <div
            ref={zone}
            className={`rico-zone ${appuye ? 'appuye' : ''} `}
            role="slider"
            tabIndex={0}
            aria-label="Position de la coupe"
            aria-valuemin={1}
            aria-valuemax={Math.max(1, n - 1)}
            aria-valuenow={curseur ?? 1}
            aria-valuetext={curseur === null ? 'Toutes les coupes sont posées' : `Entre « ${lettres.slice(0, curseur).join('')} » et « ${lettres.slice(curseur).join('')} »`}
            onPointerDown={surAppui}
            onPointerMove={surMouvement}
            onPointerUp={relacher}
            onPointerCancel={relacher}
            onKeyDown={surTouche}
          >
            <span className="rico-mot rico-decoupe" ref={motRef} lang="fr">
              {lettres.map((l, k) => (
                <span
                  key={k}
                  className={`rico-lettre ${coupes.includes(k) ? 'apres' : ''}`}
                  style={{ '--dx': ouvert ? (k < (curseur ?? 0) ? '-0.2em' : '0.2em') : '0px' } as CSSProperties}
                  aria-hidden="true"
                >
                  {l}
                </span>
              ))}
            </span>
            {ouvert && curseur !== null && positions[curseur] !== undefined && (
              <span className="rico-lame" style={{ left: positions[curseur] }} aria-hidden="true">
                <svg className="rico-trait" aria-hidden="true" focusable="false">
                  <line x1="50%" x2="50%" y1="0" y2="100%" />
                </svg>
                <span className="rico-poignee">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
                  </svg>
                </span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="rico-verdict" role="status" aria-live="polite" ref={(e) => (valide ? e?.scrollIntoView?.({ block: 'nearest' }) : undefined)}>
        {valide && (
          <>
            <strong>
              <Rond juste={juste} /> {juste ? 'Bien vu.' : 'Pas cette fois.'}
            </strong>
            <div>{lecon}</div>
          </>
        )}
      </div>
      {pied && !valide && createPortal(commandes, pied)}
    </>
  )
}

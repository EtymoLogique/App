import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { mouvementReduit } from '../services/animation'
import type { EntreeCodex } from '../services/codex'
import {
  BARRE,
  JEU_BARRE,
  MARGE,
  type Mesurer,
  OMBRE,
  PAS,
  type VueReseau,
  cle,
  construireReseau,
  derniere,
  disposer,
  estimer,
  famille,
  portee,
  tracer,
} from '../services/constellation'
import type { CatalogueJeu } from '../services/jeu'
import { PetiteBrique } from './Brique'

interface Props {
  jeu: CatalogueJeu
  entrees: EntreeCodex[]
  /** Numéros des fascicules débloqués : un fascicule verrouillé n'entre jamais dans le réseau (ADR 0069). */
  debloques: Set<number>
  /** Ouvrir la carte d'un mot au codex. */
  onOuvrir: (id: string) => void
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
const formes = (n: number, total: number) => `${n} mot${n > 1 ? 's' : ''} formé${n > 1 ? 's' : ''} sur ${total}`

/** Mesure au canvas, dans les polices de la page ; estimation hors navigateur. */
function useMesure(): Mesurer {
  return useMemo(() => {
    const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext?.('2d') : null
    if (!ctx) return estimer
    const css = getComputedStyle(document.documentElement)
    const polices = { serif: css.getPropertyValue('--serif').trim() || 'serif', mono: css.getPropertyValue('--mono').trim() || 'monospace' }
    const memo = new Map<string, number>()
    return (texte, taille, famille, gras) => {
      const police = `${gras ? 700 : 400} ${taille}px ${polices[famille]}`
      const k = `${police}|${texte}`
      let l = memo.get(k)
      if (l === undefined) {
        ctx.font = police
        l = ctx.measureText(texte).width
        memo.set(k, l)
      }
      return l
    }
  }, [])
}

/**
 * Vue Réseau du codex (App#91) : la constellation en deux rives. Elle s'ouvre sur
 * le dernier fascicule débloqué ; toucher une brique suit sa famille dans un
 * panneau collé en bas ; une liste en repli dit la même chose en texte.
 */
export function Constellation({ jeu, entrees, debloques, onOuvrir }: Props) {
  const reseau = useMemo(() => construireReseau(jeu, entrees, debloques), [jeu, entrees, debloques])
  // Par défaut, le dernier fascicule débloqué où le joueur a trouvé un mot : une vue vide n'apprend rien.
  const avecMot = new Set(reseau.mots.filter((m) => m.trouve).map((m) => m.fascicule))
  const dernierFascicule = [...reseau.fascicules].reverse().find((f) => avecMot.has(f.numero))?.numero ?? reseau.fascicules.at(-1)?.numero ?? 'tous'
  const [vue, setVue] = useState<VueReseau | null>(null)
  const [mode, setMode] = useState<'reseau' | 'liste'>('reseau')
  const [focus, setFocus] = useState<string | null>(null)
  const [deplie, setDeplie] = useState(false)
  const cadre = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [largeur, setLargeur] = useState(0)
  const mesurer = useMesure()

  // Un fascicule qui se verrouille (réinitialisation) ou disparaît : retour au dernier débloqué.
  const vueValide = vue !== null && (vue === 'tous' || reseau.fascicules.some((f) => f.numero === vue)) ? vue : dernierFascicule
  const { mots, bandes } = useMemo(() => portee(reseau, vueValide), [reseau, vueValide])
  const dernier = derniere(mots)
  const focusValide = focus && mots.some((m) => cle('g', m.gauche) === focus || cle('d', m.droite) === focus) ? focus : null

  useLayoutEffect(() => {
    const el = cadre.current
    if (!el) return
    const lire = () => setLargeur(Math.floor(el.clientWidth))
    lire()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(lire)
    obs.observe(el)
    return () => obs.disconnect()
  }, [mode])

  const L = useMemo(() => disposer(reseau, bandes, largeur || 360, vueValide === 'tous', mesurer), [reseau, bandes, largeur, vueValide, mesurer])
  const { liens, antennes } = useMemo(() => tracer(L, mots, dernier, focusValide), [L, mots, dernier, focusValide])

  // Insertion : les briques déjà là qui changent de rangée glissent (240 ms), les nouvelles apparaissent.
  const precedent = useRef<{ cle: string; positions: Map<string, number> } | null>(null)
  useLayoutEffect(() => {
    const cleRendu = `${vueValide}|${L.largeur}`
    const positions = new Map([...L.places].map(([k, p]) => [k, p.y]))
    const avant = precedent.current
    precedent.current = { cle: cleRendu, positions }
    if (!avant || avant.cle !== cleRendu || mouvementReduit() || !svg.current) return
    svg.current.querySelectorAll<SVGGElement>('.cst-n').forEach((n) => {
      if (typeof n.animate !== 'function') return
      const k = n.dataset.cle ?? ''
      const y0 = avant.positions.get(k)
      const y1 = positions.get(k)
      if (y0 === undefined) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' })
      else if (y1 !== undefined && y0 !== y1) n.animate([{ transform: `translateY(${y0 - y1}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
    })
  }, [L, vueValide])

  // Suivre une brique depuis le panneau : elle passe au centre et prend le focus.
  const [aSuivre, setASuivre] = useState<string | null>(null)
  useEffect(() => {
    if (!aSuivre || !svg.current) return
    const n = svg.current.querySelector<SVGGElement>(`[data-cle="${CSS.escape(aSuivre)}"]`)
    n?.scrollIntoView?.({ block: 'center', behavior: mouvementReduit() ? 'auto' : 'smooth' })
    n?.focus({ preventScroll: true })
    setASuivre(null)
  }, [aSuivre])

  const nomFascicule = (n: number) => reseau.fascicules.find((f) => f.numero === n)?.nom ?? `Fascicule ${n}`
  const ou = vueValide === 'tous' ? 'dans les fascicules ouverts' : `dans ${nomFascicule(vueValide)}`
  const nbBriques = bandes.reduce((t, b) => t + b.g.length + b.d.length, 0)
  const totalVue = vueValide === 'tous' ? reseau.mots.length : reseau.mots.filter((m) => m.fascicule === vueValide).length
  const voisins = new Set(focusValide ? mots.filter((m) => cle('g', m.gauche) === focusValide || cle('d', m.droite) === focusValide).flatMap((m) => [cle('g', m.gauche), cle('d', m.droite)]) : [])
  const briqueDe = (k: string) => jeu.briques.get(k.slice(2))
  const choisir = (k: string) => {
    setFocus(focusValide === k ? null : k)
    setDeplie(false)
  }
  const suivre = (k: string) => {
    setFocus(k)
    setASuivre(k)
  }
  const vide = vueValide === 'tous' ? 'Aucun mot trouvé pour l’instant.' : `Aucun mot trouvé dans ${nomFascicule(vueValide)} pour l’instant : sa constellation commence à votre première découverte.`

  const familleFocus = focusValide ? famille(reseau, focusValide.slice(2), vueValide) : null
  const briqueFocus = focusValide ? briqueDe(focusValide) : undefined

  return (
    <div className="cst">
      <div className="cst-choix">
        <div className="cb-views cst-vues" role="group" aria-label="Fascicule affiché">
          {reseau.fascicules.map((f) => (
            <button key={f.numero} type="button" aria-pressed={vueValide === f.numero} onClick={() => setVue(f.numero)}>
              {f.numero}&nbsp;· {f.nom}
            </button>
          ))}
          <button type="button" aria-pressed={vueValide === 'tous'} onClick={() => setVue('tous')}>
            Tous
          </button>
        </div>
        <div className="cb-views" role="group" aria-label="Présentation">
          <button type="button" aria-pressed={mode === 'reseau'} onClick={() => setMode('reseau')}>
            Réseau
          </button>
          <button type="button" aria-pressed={mode === 'liste'} onClick={() => setMode('liste')}>
            Liste
          </button>
        </div>
      </div>

      <p className="cb-note">
        {vueValide === 'tous' ? `${pluriel(mots.length, 'mot')} trouvé${mots.length > 1 ? 's' : ''}` : `${mots.length} sur ${totalVue} mots ${ou}`} · {pluriel(nbBriques, 'brique')}.
        {dernier && (
          <>
            {' '}
            Dernière découverte&nbsp;: <em className="cst-mot">{dernier.libelle}</em>.
          </>
        )}
      </p>

      {mots.length === 0 ? (
        <div className="cb-empty">
          <p>{vide}</p>
        </div>
      ) : mode === 'reseau' ? (
        <div ref={cadre} className="cst-cadre">
          <svg
            ref={svg}
            className={focusValide ? 'cst-svg has-focus' : 'cst-svg'}
            width={L.largeur}
            height={L.hauteur}
            viewBox={`0 0 ${L.largeur} ${L.hauteur}`}
            role="group"
            aria-label={`Constellation : ${pluriel(L.places.size, 'brique')}, ${pluriel(mots.length, 'mot')}. Touchez une brique pour suivre sa famille.`}
          >
            <g aria-hidden="true">
              {L.bandes.map((b) => (
                <g key={b.numero}>
                  {b.y0 > 0 && <path className="cst-filet" d={`M0 ${b.y0 + 0.5}H${L.xG + OMBRE}M${L.xD} ${b.y0 + 0.5}H${L.largeur}`} />}
                  {b.lignes.map((l, i) => (
                    <text key={i} className="cst-titre" x={MARGE} y={b.y0 + 14 + i * 16}>
                      {l}
                    </text>
                  ))}
                </g>
              ))}
            </g>
            <g aria-hidden="true">
              {liens.map((l) => (
                <path key={l.mot.id} className={['cst-lien', l.dernier ? 'is-dernier' : '', l.famille ? 'is-famille' : ''].filter(Boolean).join(' ')} d={l.d} />
              ))}
            </g>
            <g aria-hidden="true">
              {antennes.map((a) => (
                <g key={`${a.cle}|${a.sens}`}>
                  <path className="cst-antenne" d={a.d} />
                  <text className="cst-compte" x={a.x.toFixed(1)} y={a.y.toFixed(1)} textAnchor={a.cote === 'g' ? 'start' : 'end'} dominantBaseline="central">
                    {a.sens < 0 ? '↑' : '↓'}
                    {a.nombre}
                  </text>
                </g>
              ))}
            </g>
            <g>
              {[...L.places].map(([k, p]) => {
                const b = reseau.briques.get(p.brique)
                if (!b) return null
                const g = p.cote === 'g'
                const { trouves, total } = famille(reseau, p.brique, vueValide)
                const haut = p.yb - L.h / 2
                const yBarre = haut + L.h + OMBRE + JEU_BARRE
                const classes = ['cst-n', focusValide === k ? 'is-focus' : '', focusValide && !voisins.has(k) ? 'is-loin' : ''].filter(Boolean).join(' ')
                return (
                  <g
                    key={k}
                    className={classes}
                    data-cle={k}
                    tabIndex={0}
                    role="button"
                    aria-pressed={focusValide === k}
                    aria-label={`${b.libelle}${b.glose ? `, « ${b.glose} »` : ''}, ${formes(trouves, total)} ${ou}`}
                    onClick={() => choisir(k)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        choisir(k)
                      }
                    }}
                  >
                    <rect className="cst-cible" x={g ? MARGE : L.xD - OMBRE} y={p.y - PAS / 2} width={L.k + L.col + OMBRE + 1} height={PAS} rx={8} />
                    <rect className="cst-ombre" x={p.x + OMBRE} y={haut + OMBRE} width={p.largeur} height={L.h} rx={6} />
                    <rect className="cst-brique" data-kind={b.nature} x={p.x} y={haut} width={p.largeur} height={L.h} rx={6} />
                    <text className="cst-etiquette" x={p.x + p.largeur / 2} y={p.yb + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={L.police}>
                      {b.libelle}
                    </text>
                    <rect className="cst-rail" x={p.x} y={yBarre} width={p.largeur} height={BARRE} rx={2.5} />
                    {trouves > 0 && <rect className="cst-part" x={p.x + 0.75} y={yBarre + 0.75} width={Math.max(0, ((p.largeur - 1.5) * trouves) / total)} height={BARRE - 1.5} rx={1.75} />}
                    {L.compteurs && (
                      <text className="cst-cpt" x={g ? p.x - 6 : p.x + p.largeur + OMBRE + 6} y={p.yb + 0.5} textAnchor={g ? 'end' : 'start'} dominantBaseline="central">
                        {trouves}/{total}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      ) : (
        <div className="cst-liste">
          {bandes.map((bande) => (
            <section key={bande.numero} className="cst-bande" aria-labelledby={`cst-bande-${bande.numero}`}>
              <h3 id={`cst-bande-${bande.numero}`}>
                {bande.numero}&nbsp;· {nomFascicule(bande.numero)}
              </h3>
              <div className="cst-cols">
                {(['g', 'd'] as const).map((cote) => (
                  <ul key={cote} className="cst-familles" aria-label={cote === 'g' ? 'Briques de la 1ʳᵉ case' : 'Briques de la 2ᵉ case'}>
                    {bande[cote].map((id) => {
                      const b = jeu.briques.get(id)
                      const { formes: siens, trouves, total } = famille(reseau, id, vueValide)
                      return (
                        <li key={id}>
                          <div className="cst-fam-tete">
                            {b && <PetiteBrique brique={b} />}
                            <span className="cst-barre" aria-hidden="true">
                              <i style={{ width: `${(trouves / total) * 100}%` }} />
                            </span>
                            <span className="cst-num">
                              {trouves} sur {total}
                            </span>
                          </div>
                          <p className="cst-mots-liste">
                            {siens.map((m, i) => (
                              <span key={m.id}>
                                {i > 0 && ', '}
                                <button type="button" className="cst-lien-mot" onClick={() => onOuvrir(m.id)}>
                                  {m.libelle}
                                </button>
                              </span>
                            ))}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {mode === 'reseau' && focusValide && familleFocus && briqueFocus && (
        <div className="cst-panneau" role="region" aria-label="Famille suivie">
          <div className="cst-tete">
            <button type="button" className="cst-deplier" aria-expanded={deplie} aria-controls="cst-mots" onClick={() => setDeplie(!deplie)}>
              <span className="cst-resume-fam">
                <PetiteBrique brique={briqueFocus} />
                {briqueFocus.glose && <span className="cst-glose">«&nbsp;{briqueFocus.glose}&nbsp;»</span>}
                <span className="cst-nb">{formes(familleFocus.trouves, familleFocus.total)}</span>
              </span>
              <span className="cst-chevron" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-secondary cst-fermer"
              onClick={() => {
                const avant = focusValide
                setFocus(null)
                setASuivre(avant)
              }}
            >
              Fermer
            </button>
          </div>
          <ul id="cst-mots" className="cst-mots" hidden={!deplie}>
            {familleFocus.formes.map((m) => {
              const partenaire = focusValide === cle('g', m.gauche) ? cle('d', m.droite) : cle('g', m.gauche)
              const b = briqueDe(partenaire)
              return (
                <li key={m.id}>
                  <button type="button" className="cst-lien-mot" onClick={() => onOuvrir(m.id)}>
                    {m.libelle}
                  </button>
                  {b && (
                    <button type="button" className="cst-partenaire" aria-label={`Suivre la famille de ${b.libelle}`} onClick={() => suivre(partenaire)}>
                      <PetiteBrique brique={b} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

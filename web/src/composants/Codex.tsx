import { Fragment, cloneElement, createContext, useContext, useEffect, useRef, useState } from 'react'

import {
  CERTITUDES,
  CONFIANCES,
  type EntreeCodex,
  type Famille,
  NB_RECENTES,
  ORDRE_TYPES,
  TYPES,
  type TypeCarte,
  completude,
  familles,
  recentes,
  rechercher,
  savoirPlus,
  silhouetteDe,
} from '../services/codex'
import type { CatalogueJeu } from '../services/jeu'
import { type FasciculeParu, NATURES, libelleFascicule } from '../services/jeu'
import type { Route, TriCodex, VueCodex } from '../services/route'
import { MotSegmente } from './MotSegmente'
import { chargerSilhouette } from '../services/silhouettes'
import { PetiteBrique } from './Brique'
import { FormeRarete } from './Rarete'
import { Sablier } from './Sabliers'

type Tri = TriCodex
const TRIS: [Tri, string][] = [
  ['n', 'N°'],
  ['az', 'A → Z'],
  ['type', 'Type'],
  ['fasc', 'Fascicule'],
]

const numero = (n: number) => `N°\u00a0${String(n).padStart(3, '0')}`

/** « du grec ancien », « de l’hébreu » : les noms de langue sont masculins. */
function deLangue(nom: string): string {
  const langue = nom.toLowerCase()
  return /^[aeiouyéèêh]/.test(langue) ? `de l’${langue}` : `du ${langue}`
}

const VUES: [VueCodex, string][] = [
  ['tout', 'Tout'],
  ['recentes', 'Récentes'],
  ['familles', 'Familles'],
  ['objectifs', 'Objectifs'],
]

/** Bandeau : couleur du type de ressource ; Encre pour un mot (identité, « une couleur, un seul sens »). */
function bandeau(type: TypeCarte): React.CSSProperties {
  // Bandeau, texte, et teinte de la forme de rareté posée dessus : plus foncée
  // qu'un bandeau clair, plus claire que le bandeau Encre d'un mot (ADR 0040).
  const couleurs: Record<TypeCarte, [string, string, string]> = {
    mot: ['var(--fixed-ink)', '#f3eee3', 'color-mix(in srgb, var(--fixed-ink), #f3eee3 38%)'],
    prefixe: ['var(--c-prefix)', 'var(--fixed-ink)', 'var(--c-prefix-deep)'],
    suffixe: ['var(--c-suffix)', 'var(--fixed-ink)', 'var(--c-suffix-deep)'],
    langue: ['var(--c-lang)', 'var(--fixed-ink)', 'var(--c-lang-deep)'],
  }
  const [tc, tt, rd] = couleurs[type]
  return { '--tc': tc, '--tt': tt, '--rd': rd } as React.CSSProperties
}

/** Lecture d'un média haché du catalogue, en texte. */
type LireMedia = (chemin: string) => Promise<string>
const LectureMedia = createContext<LireMedia | null>(null)

/**
 * Texture de carte (ADR 0023) : la silhouette, insérée dans la carte pour
 * prendre sa teinte et le fond de ses évidements. Seulement une fois la carte
 * trouvée, pour ne rien trahir.
 */
function Texture({ entree }: { entree: EntreeCodex }) {
  const lire = useContext(LectureMedia)
  const hote = useRef<HTMLSpanElement>(null)
  const chemin = entree.trouvee ? entree.silhouette : null
  useEffect(() => {
    if (!chemin || !lire) return
    let actif = true
    void chargerSilhouette(chemin, lire).then((svg) => {
      if (actif && svg && hote.current) hote.current.replaceChildren(svg)
    })
    return () => {
      actif = false
    }
  }, [chemin, lire])
  if (!chemin) return null
  return <span ref={hote} className="card-art" aria-hidden="true" />
}

function Brique({ libelle, nature, className = 'bchip' }: { libelle: string; nature: string; className?: string }) {
  return (
    <span className={className} data-kind={nature}>
      {libelle}
    </span>
  )
}

/**
 * Comparateur d'un tri. Inversé, seul le critère principal change de sens :
 * les cartes à découvrir restent après les cartes trouvées.
 */
const tri = (t: Tri, inverse: boolean) => (a: EntreeCodex, b: EntreeCodex) => {
  const sens = inverse ? -1 : 1
  const cle = (e: EntreeCodex) => (e.trouvee ? e.libelle.replace(/^-/, '') : '')
  switch (t) {
    case 'n':
      return sens * (a.n - b.n)
    case 'az':
      return Number(!a.trouvee) - Number(!b.trouvee) || sens * cle(a).localeCompare(cle(b), 'fr', { sensitivity: 'base' })
    case 'type':
      return sens * (ORDRE_TYPES.indexOf(a.type) - ORDRE_TYPES.indexOf(b.type)) || a.n - b.n
    case 'fasc':
      return sens * (a.fascicule - b.fascicule) || Number(!a.trouvee) - Number(!b.trouvee) || a.n - b.n
  }
}

export function Mini({ entree, nouvelle, langue, onOuvrir }: { entree: EntreeCodex; nouvelle: boolean; langue: string | null; onOuvrir: () => void }) {
  const type = TYPES[entree.type]
  const affixe = entree.type === 'prefixe' || entree.type === 'suffixe'
  const nbFormes = entree.formes.length
  const trouvees = entree.formes.filter((f) => f.trouvee).length
  const label = entree.trouvee
    ? `${nouvelle ? 'Nouvelle carte : ' : ''}${entree.libelle}, ${type.libelle.toLowerCase()}${entree.sens ? `, « ${entree.sens} »` : ''}, fascicule ${entree.fascicule}, ${trouvees} formes trouvées sur ${nbFormes}`
    : `Carte ${entree.n}, fascicule ${entree.fascicule} : ${type.libelle.toLowerCase()} à découvrir`
  const classes = ['mini', entree.trouvee ? '' : 'locked', nouvelle && entree.trouvee ? 'is-new' : '', entree.legendaire ? 'is-legend' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={classes} data-type={entree.type} style={bandeau(entree.type)} aria-label={label} onClick={onOuvrir}>
      <span className="m-top">
        <span>
          {numero(entree.n)}
          {nouvelle && entree.trouvee && <span className="new-dot" />}
        </span>
        <span className="m-side">
          <span className="m-kind">{type.libelle}</span>
          {entree.rarete && <FormeRarete rarete={entree.rarete} className="rar m-rar" />}
        </span>
      </span>
      {entree.trouvee ? (
        <>
          <Texture entree={entree} />
          {entree.type === 'langue' && <span className="m-glyph">{entree.glyphe}</span>}
          {affixe ? (
            <Brique libelle={entree.libelle} nature={NATURES[entree.type as 'prefixe' | 'suffixe']} className="bchip m-brick" />
          ) : (
            <span className="m-word">{entree.libelle}</span>
          )}
          {entree.sens && <span className="m-lit">«&nbsp;{entree.sens}&nbsp;»</span>}
          <span className="m-foot">
            {entree.type === 'langue' ? (
              <span>
                {trouvees} / {nbFormes} formes
              </span>
            ) : (
              <>
                <span className="m-lang">
                  <i />
                  {langue}
                </span>
                <span className="m-dots">
                  {entree.formes.map((f, i) => (
                    <i key={i} className={f.trouvee ? 'on' : undefined} />
                  ))}
                </span>
              </>
            )}
          </span>
        </>
      ) : (
        <>
          <span className="m-q">?</span>
          <span className="m-foot">{entree.sens ? `Piste : « ${entree.sens} »` : 'À découvrir'}</span>
        </>
      )}
    </button>
  )
}

interface VisionneuseProps {
  /** Cartes visibles dans la grille : précédente et suivante. */
  entrees: EntreeCodex[]
  /** Toutes les cartes, pour suivre un lien vers une carte filtrée. */
  toutes: EntreeCodex[]
  entree: EntreeCodex
  /** Cartes quittées par des liens, pour le fil d'Ariane. */
  fil: EntreeCodex[]
  jeu: CatalogueJeu
  onNaviguer: (id: string) => void
  onSuivreLien: (id: string) => void
  onRemonter: (rang: number) => void
  onFermer: () => void
  /** Section « En savoir plus » dépliée (I-16), tenue dans l'adresse. */
  plus: boolean
  onPlus: (plus: boolean) => void
}

/** Carte agrandie (I-15) : recto, puis verso retourné, précédente et suivante au clavier. */
function Visionneuse({ entrees, toutes, entree, fil, jeu, onNaviguer, onSuivreLien, onRemonter, onFermer, plus, onPlus }: VisionneuseProps) {
  const [retournee, setRetournee] = useState(false)
  const fermer = useRef<HTMLButtonElement>(null)
  const index = entrees.findIndex((e) => e.id === entree.id)
  const voisine = (pas: number) => {
    if (entrees.length === 0) return
    const i = index < 0 ? 0 : (index + pas + entrees.length) % entrees.length
    const e = entrees[i]
    if (e) onNaviguer(e.id)
  }
  useEffect(() => {
    fermer.current?.focus()
  }, [])
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.getAttribute('role') === 'link' && (e.key === 'Enter' || e.key === ' ')) return
      if (e.key === 'Escape') onFermer()
      else if (e.key === 'ArrowLeft') voisine(-1)
      else if (e.key === 'ArrowRight') voisine(1)
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  })

  /**
   * Lien vers une autre carte qui y fait référence (codex.html) : seulement
   * vers une carte déjà trouvée, pour ne rien dévoiler, et jamais vers elle-même.
   */
  const lier = (noeud: React.ReactElement<{ className?: string }>, id: string | null | undefined, libelle: string) => {
    const cible = id ? toutes.find((e) => e.id === id) : undefined
    if (!cible || !cible.trouvee || cible.id === entree.id) return noeud
    const aller = (ev: React.SyntheticEvent) => {
      ev.stopPropagation()
      ev.preventDefault()
      onSuivreLien(cible.id)
    }
    // Clonage : l'élément garde ses attributs (data-kind, style) et devient un lien.
    return cloneElement(noeud, {
      className: `${noeud.props.className ?? ''} is-link`.trim(),
      role: 'link',
      tabIndex: 0,
      'aria-label': `Ouvrir la carte ${libelle}`,
      onClick: aller,
      onKeyDown: (ev: React.KeyboardEvent) => (ev.key === 'Enter' || ev.key === ' ') && aller(ev),
    } as React.HTMLAttributes<HTMLElement>)
  }
  const type = TYPES[entree.type]
  const langue = entree.langueId ? jeu.langues.get(entree.langueId) : null
  const affixe = entree.type === 'prefixe' || entree.type === 'suffixe'
  const trouvees = entree.formes.filter((f) => f.trouvee).length
  const composition = entree.carte?.compositions?.find((c) => c.preferee) ?? entree.carte?.compositions?.[0]
  const note = composition?.libelles.fr?.explication_courte ?? null
  const partie = (id: string) => [...jeu.briques.values()].find((b) => b.uniteId === id)
  const parties = [...(composition?.parties ?? [])].sort((a, b) => a.rang - b.rang)
  const segments = parties.filter((p) => p.segment_debut != null && p.segment_fin != null && jeu.cartes.has(p.unite_id))
  const savoir = savoirPlus(entree, jeu)
  const plusOuvert = plus && savoir !== null
  const essai = jeu.fascicules.find((f) => f.numero === entree.fascicule)?.manifeste.test === true

  const haut = (
    <div className="bf-top">
      <span>{numero(entree.n)}</span>
      <span className="bf-side">
        <span className="bf-type">{type.libelle}</span>
        {entree.rarete && <FormeRarete rarete={entree.rarete} className="rar bf-rar" />}
      </span>
    </div>
  )

  return (
    <div className={plusOuvert ? 'viewer with-more' : 'viewer'} role="dialog" aria-modal="true" aria-label={entree.trouvee ? entree.libelle : `Carte ${entree.n}`}>
      <div className="viewer-backdrop" onClick={onFermer} />
      <button ref={fermer} className="viewer-close" type="button" onClick={onFermer} aria-label="Fermer la carte">
        ×
      </button>
      <button className="viewer-nav prev" type="button" onClick={() => voisine(-1)} aria-label="Carte précédente">
        ←
      </button>
      <nav className="viewer-trail" aria-label="Parcours entre les cartes" data-empty={fil.length === 0 ? '' : undefined}>
        {fil.length > 0 && (
          <>
            <button type="button" className="trail-back" aria-label={`Revenir à la carte ${fil[fil.length - 1]?.libelle ?? ''}`} onClick={() => onRemonter(fil.length - 1)}>
              ←
            </button>
            {fil.map((e, i) => (
              <Fragment key={`${e.id}-${i}`}>
                <button type="button" className="crumb" onClick={() => onRemonter(i)}>
                  {e.type === 'prefixe' || e.type === 'suffixe' ? <Brique libelle={e.libelle} nature={NATURES[e.type]} /> : e.libelle}
                </button>
                <span className="trail-sep" aria-hidden="true">
                  ›
                </span>
              </Fragment>
            ))}
            <span className="crumb" aria-current="page">
              {entree.type === 'prefixe' || entree.type === 'suffixe' ? <Brique libelle={entree.libelle} nature={NATURES[entree.type]} /> : entree.libelle}
            </span>
          </>
        )}
      </nav>
      <div className="big-wrap">
        <div className={retournee ? 'big-card flipped' : 'big-card'} style={bandeau(entree.type)}>
          <div className="big-face big-front" aria-hidden={retournee}>
            <Texture entree={entree} />
            {haut}
            <div className="bf-body">
              {entree.trouvee ? (
                <>
                  {entree.type === 'langue' && <p className="bf-glyph">{entree.glyphe}</p>}
                  {affixe ? (
                    <div className="brick bf-brick" data-kind={NATURES[entree.type as 'prefixe' | 'suffixe']}>
                      <span className="b-label">{entree.libelle}</span>
                      <span className="b-meta">
                        {NATURES[entree.type as 'prefixe' | 'suffixe']} · «&nbsp;{entree.sens}&nbsp;»
                      </span>
                    </div>
                  ) : (
                    <p className="bf-word">
                      <MotSegmente
                        mot={entree.libelle}
                        morceaux={segments.map((p) => ({ debut: p.segment_debut as number, fin: p.segment_fin as number, nature: jeu.cartes.get(p.unite_id)?.nature ?? 'mot' }))}
                        lier={(i, noeud) => {
                          const p = segments[i]
                          const cible = p ? toutes.find((e) => e.id === p.unite_id) : undefined
                          return lier(noeud, p?.unite_id, cible?.libelle ?? '')
                        }}
                      />
                    </p>
                  )}
                  {entree.type !== 'langue' && langue && (
                    <p>
                      {lier(
                        <span className="bf-lang">
                          <i />
                          {langue}
                        </span>,
                        entree.langueId,
                        langue,
                      )}
                    </p>
                  )}
                  {entree.definition && <p className="bf-def">{entree.definition}</p>}
                  {parties.length > 0 && (
                    <div className="r-eq">
                      {parties.map((p, i) => {
                        const b = partie(p.unite_id)
                        return (
                          <Fragment key={p.rang}>
                            {i > 0 && <span className="r-op">+</span>}
                            {b &&
                              lier(
                                <span className="brick s" data-kind={NATURES[b.nature]}>
                                  <span className="b-label">{b.libelle}</span>
                                  <span className="b-meta">
                                    <span className="b-kind">
                                      {NATURES[b.nature]}
                                      {b.glose && ' · '}
                                    </span>
                                    {b.glose && <>«&nbsp;{b.glose}&nbsp;»</>}
                                  </span>
                                </span>,
                                p.unite_id,
                                b.libelle,
                              )}
                          </Fragment>
                        )
                      })}
                    </div>
                  )}
                  {!affixe && entree.sens && <p className="bf-lit">«&nbsp;{entree.sens}&nbsp;»</p>}
                  {note && <p className="bf-note">{note}</p>}
                  {savoir && (
                    <button type="button" className="bf-more" aria-expanded={plusOuvert} aria-controls="savoir-plus" onClick={() => onPlus(!plusOuvert)}>
                      {plusOuvert ? 'Replier' : 'En savoir plus'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="bf-q">?</p>
                  <p className="bf-def">Cette carte n’est pas encore découverte.</p>
                  {entree.sens && <p className="bf-lit">Piste : «&nbsp;{entree.sens}&nbsp;»</p>}
                </>
              )}
            </div>
            <div className="bf-foot">
              <span className="conf">
                {entree.trouvee && entree.confiance ? (
                  <>
                    <i />
                    <i />
                    <i />
                    <b>{CONFIANCES[entree.confiance]}</b>
                  </>
                ) : (
                  <b>{entree.trouvee ? '' : 'Inconnue'}</b>
                )}
              </span>
              <button className="flip-btn" type="button" onClick={() => setRetournee(true)}>
                <span>Voir les formes</span>
                <em aria-hidden="true">↻</em>
              </button>
            </div>
          </div>

          <div className="big-face big-back" aria-hidden={!retournee}>
            {haut}
            <div className="bf-body bb-body">
              <p className="bb-title">{entree.type === 'langue' ? `Formes en ${entree.libelle.toLowerCase()}` : 'Formes trouvées'}</p>
              {entree.formes.length === 0 || !entree.trouvee ? (
                <p className="bf-note">Découvrez cette carte pour révéler ses formes dans chaque langue.</p>
              ) : (
                <>
                  <div className="bb-progress">
                    <span className="bb-bar">
                      <i style={{ width: `${(trouvees / entree.formes.length) * 100}%` }} />
                    </span>
                    <span>
                      {trouvees} / {entree.formes.length}
                    </span>
                  </div>
                  <ul className="bb-forms">
                    {entree.formes.map((f, i) => (
                      <li key={i} className={f.trouvee ? undefined : 'missing'}>
                        <i />
                        <span className="f-text">
                          <span className="f-form" lang={f.trouvee ? undefined : undefined}>
                            {f.trouvee ? f.texte : silhouetteDe(f.texte)}
                          </span>
                          {f.trouvee && (f.translitteration || f.dans) && (
                            <span className="f-tr">
                              {f.translitteration}
                              {f.translitteration && f.dans && ' · '}
                              {f.dans && <>dans {lier(<span className="f-from">{f.dans}</span>, f.dansId, f.dans)}</>}
                            </span>
                          )}
                          {!f.trouvee && <span className="f-tr">À découvrir</span>}
                        </span>
                        {entree.type !== 'langue' && lier(<span className="f-lang">{jeu.langues.get(f.langueId)}</span>, f.trouvee ? f.langueId : null, jeu.langues.get(f.langueId) ?? '')}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {entree.trouvee && entree.liens && (
                <>
                  <p className="bb-links-title">{entree.liens.titre}</p>
                  {entree.liens.titre === 'Mots formés' && (
                    <div className="bb-progress">
                      <span className="bb-bar">
                        <i style={{ width: `${(entree.liens.items.filter((l) => l.trouve).length / entree.liens.items.length) * 100}%` }} />
                      </span>
                      <span>
                        {entree.liens.items.filter((l) => l.trouve).length} / {entree.liens.items.length} mots
                      </span>
                    </div>
                  )}
                  <div className="bb-links">
                    {entree.liens.items.map((l, i) =>
                      l.nature !== 'mot' ? (
                        <Fragment key={i}>
                          {lier(<span className={l.trouve ? 'bchip' : 'bchip missing'} data-kind={NATURES[l.nature]}>{l.libelle}</span>, l.trouve ? l.id : null, l.libelle)}
                        </Fragment>
                      ) : (
                        <Fragment key={i}>
                          {lier(<span className={l.trouve ? 'bb-link' : 'bb-link missing'}>{l.trouve ? l.libelle : silhouetteDe(l.libelle)}</span>, l.trouve ? l.id : null, l.libelle)}
                        </Fragment>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="bf-foot">
              <span />
              <button className="flip-btn" type="button" onClick={() => setRetournee(false)}>
                <span>Retourner</span>
                <em aria-hidden="true">↻</em>
              </button>
            </div>
          </div>
        </div>
      </div>
      {plusOuvert && savoir && (
        <section id="savoir-plus" className="more" aria-label={`En savoir plus sur ${entree.libelle}`}>
          <div className="more-head">
            <h3 className="more-title">En savoir plus</h3>
            <button type="button" className="more-close" aria-label="Replier la section" onClick={() => onPlus(false)}>
              ×
            </button>
          </div>
          {(savoir.chemin.length > 0 || savoir.relations.length > 0) && (
            <>
              <p className="more-k">Relation historique</p>
              {savoir.chemin.length > 0 && (
                <p className="more-path" aria-label={`Chemin des langues : ${savoir.chemin.map((c) => c.nom).join(', puis ')}`}>
                  {savoir.chemin.map((c, i) => (
                    <Fragment key={c.id}>
                      {i > 0 && (
                        <span className="more-arrow" aria-hidden="true">
                          →
                        </span>
                      )}
                      <span className="bf-lang">
                        <i />
                        {c.nom}
                      </span>
                    </Fragment>
                  ))}
                </p>
              )}
              {savoir.relations.length > 0 && (
                <ul className="more-list">
                  {savoir.relations.map((r, i) => (
                    <li key={i}>
                      {r.de &&
                        lier(
                          <span className="bchip" data-kind={NATURES[r.de.nature]}>
                            {r.de.libelle}
                          </span>,
                          r.de.id,
                          r.de.libelle,
                        )}
                      <span>
                        {r.type} {r.langue ? deLangue(r.langue) : 'de'} <span className="more-etymon">{r.texte}</span>
                        {r.translitteration && (
                          <>
                            {' '}
                            (<i>{r.translitteration}</i>)
                          </>
                        )}
                        {r.glose && <> «&nbsp;{r.glose}&nbsp;»</>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {savoir.transformations.length > 0 && (
            <>
              <p className="more-k">{savoir.transformations.length > 1 ? 'Transformations' : 'Transformation'}</p>
              <ul className="more-list">
                {savoir.transformations.map((t, i) => (
                  <li key={i}>
                    <span className="more-tag">{t.type}</span>
                    <span>{t.texte}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {savoir.confiance && (
            <>
              <p className="more-k">Certitude</p>
              <p className="more-row">
                <span className={savoir.confiance === 'probable' ? 'conf p2' : savoir.confiance === 'etablie' ? 'conf' : 'conf p1'}>
                  <i />
                  <i />
                  <i />
                  <b>{CONFIANCES[savoir.confiance]}</b>
                </span>
                <span className="more-p">{CERTITUDES[savoir.confiance]}</span>
              </p>
            </>
          )}
          {savoir.sources.length > 0 && (
            <>
              <p className="more-k">Sources</p>
              <ul className="more-sources">
                {savoir.sources.map((src) => (
                  <li key={src.id}>
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noopener noreferrer">
                        <b>{src.reference}</b>
                        <small>{src.detail}</small>
                        <span className="more-chev" aria-hidden="true">
                          ›
                        </span>
                      </a>
                    ) : (
                      <span>
                        <b>{src.reference}</b>
                        <small>{src.detail}</small>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="more-mono">
            {essai ? 'Fascicule d’essai : contenu à vérifier avant publication · ' : ''}version du catalogue {jeu.version}
          </p>
        </section>
      )}
      <button className="viewer-nav next" type="button" onClick={() => voisine(1)} aria-label="Carte suivante">
        →
      </button>
      <p className="viewer-hint">← → pour changer de carte · Échap pour fermer</p>
    </div>
  )
}

/** Miniature de la jaquette d'un fascicule, décorative : son numéro est écrit à côté. */
function Jaquette({ chemin, urlMedia, petite = false }: { chemin: string | null | undefined; urlMedia: (chemin: string) => string; petite?: boolean }) {
  return (
    <span className={['jk-mini', chemin ? '' : 'is-empty', petite ? 'is-xs' : ''].filter(Boolean).join(' ')} aria-hidden="true">
      {chemin && (
        <span className="jk-art">
          <img src={urlMedia(chemin)} alt="" decoding="async" />
        </span>
      )}
    </span>
  )
}

/** Nom du fascicule mis en avant, son numéro en petit ; sans nom, « Fascicule » et le numéro. */
function TitreFascicule({ fascicule }: { fascicule: FasciculeParu }) {
  return (
    <span className="fasc-titre">
      <span className="fasc-nom">{fascicule.manifeste.nom ?? 'Fascicule'}</span>
      <span className="fasc-num">N°&nbsp;{fascicule.numero}</span>
    </span>
  )
}

/** Barre de progression d'une famille, en Rose (seule couleur de famille). */
function BarreFamille({ famille }: { famille: Famille }) {
  return (
    <span className="fam-bar" aria-hidden="true">
      <i style={{ width: `${(famille.trouves / famille.mots.length) * 100}%` }} />
    </span>
  )
}

function TitreFamille({ famille }: { famille: Famille }) {
  const b = famille.brique
  const affixe = b.type === 'prefixe' || b.type === 'suffixe'
  return (
    <span className="fam-name">
      {affixe ? <Brique libelle={b.libelle} nature={NATURES[b.type as 'prefixe' | 'suffixe']} /> : <b className="fam-word">{b.libelle}</b>}
      {b.sens && <span className="fam-gloss">«&nbsp;{b.sens}&nbsp;»</span>}
    </span>
  )
}

interface Props {
  entrees: EntreeCodex[]
  jeu: CatalogueJeu
  nouvelles: Set<string>
  onVue: (id: string) => void
  /** Vue du codex tenue dans l'URL : vue, filtres, tri et carte agrandie. */
  vue: Pick<Route, 'vue' | 'filtre' | 'tri' | 'inverse' | 'fascicule' | 'carte' | 'plus'>
  onChangerVue: (modif: Partial<Route>, options?: { remplacer?: boolean }) => void
  /** Adresse d'un média du catalogue (jaquette d'un fascicule). */
  urlMedia: (chemin: string) => string
  /** Lecture vérifiée d'un média du catalogue (silhouettes des cartes). */
  lireMedia: LireMedia
  /** Jalons atteints, confirmés par le serveur (ADR 0038). */
  jalonsAtteints?: string[]
}

/**
 * Jalons des fascicules parus (I-18) : atteints, ou progression vers le
 * prochain. La récompense s'affiche d'avance : jamais un tirage (ADR 0038).
 */
function Jalons({ jeu, entrees, atteints }: { jeu: CatalogueJeu; entrees: EntreeCodex[]; atteints: Set<string> }) {
  const lignes = jeu.fascicules.flatMap((f) => {
    const trouves = entrees.filter((e) => e.fascicule === f.numero && e.resultat && e.trouvee).length
    return (f.manifeste.jalons ?? []).map((j) => ({ f, j, trouves }))
  })
  if (lignes.length === 0) return <p className="cb-note">Aucun jalon pour l’instant.</p>
  return (
    <>
      {lignes.map(({ f, j, trouves }) => {
        const fait = atteints.has(j.id)
        const n = Math.min(trouves, j.decouvertes)
        return (
          <div key={j.id} className="fam">
            <span className="fam-head">
              <span className="fam-name">
                <b className="fam-word">
                  {j.decouvertes} découverte{j.decouvertes > 1 ? 's' : ''}
                </b>{' '}
                <small>{f.manifeste.nom ?? `Fascicule ${f.numero}`}</small>
              </span>
              <span className="fam-count">{fait ? '✓ atteint' : `${n} / ${j.decouvertes}`}</span>
            </span>
            <span className="fam-bar is-jalon" aria-hidden="true">
              <i style={{ width: `${fait ? 100 : (n / j.decouvertes) * 100}%` }} />
            </span>
            <span className="rangee" aria-label="Récompense">
              {(j.pli ?? []).map((id) => {
                const b = jeu.briques.get(id)
                return b ? <PetiteBrique key={id} brique={b} /> : null
              })}
              {(j.sabliers ?? 0) > 0 && (
                <span className="pk-inkbox">
                  <Sablier />
                  <small>
                    {j.sabliers} sablier{(j.sabliers ?? 0) > 1 ? 's' : ''}
                  </small>
                </span>
              )}
            </span>
          </div>
        )
      })}
    </>
  )
}

/**
 * Codex (I-14, codex.html) : vues Tout, Récentes, Familles et Objectifs,
 * recherche (I-17), complétude par fascicule, filtres par type, tri, cartes et
 * carte agrandie (I-15) avec sa section « En savoir plus » (I-16).
 */
export function Codex({ entrees, jeu, nouvelles, onVue, vue, onChangerVue, urlMedia, lireMedia, jalonsAtteints = [] }: Props) {
  const filtre = vue.filtre
  const ordre = vue.tri
  const fascicule = vue.fascicule ?? 'tous'
  const ouverte = vue.carte
  const setVue = (v: VueCodex) => onChangerVue({ vue: v }, { remplacer: true })
  const setFiltre = (f: TypeCarte | 'tout') => onChangerVue({ filtre: f }, { remplacer: true })
  // Toucher le tri actif l'inverse : un double clic sur un autre tri le choisit puis l'inverse.
  const setOrdre = (t: Tri) => onChangerVue(t === ordre ? { inverse: !vue.inverse } : { tri: t, inverse: false }, { remplacer: true })
  const setFascicule = (f: number | 'tous') => onChangerVue({ fascicule: f === 'tous' ? null : f }, { remplacer: true })
  const setOuverte = (id: string | null) => onChangerVue(id ? { carte: id } : { carte: null, plus: false })
  /** Fil d'Ariane : cartes quittées en suivant un lien, de la plus ancienne à la plus récente. */
  const [fil, setFil] = useState<string[]>([])
  /** Recherche : gardée à l'écran, jamais dans l'adresse (ADR 0034). */
  const [recherche, setRecherche] = useState('')
  const champ = useRef<HTMLInputElement>(null)
  /** Famille détaillée dans l'onglet Objectifs. */
  const [familleChoisie, setFamilleChoisie] = useState<string | null>(null)
  const detailFamille = useRef<HTMLElement>(null)
  // Sur mobile, le détail est sous la liste : le choisir l'amène à l'écran.
  useEffect(() => {
    if (familleChoisie) detailFamille.current?.scrollIntoView?.({ block: 'nearest' })
  }, [familleChoisie])

  /** Groupes repliés dans le tri par fascicule. */
  const [replies, setReplies] = useState<Set<number>>(() => new Set())
  const basculerGroupe = (numero: number) =>
    setReplies((r) => {
      const suite = new Set(r)
      if (!suite.delete(numero)) suite.add(numero)
      return suite
    })
  const replie = (e: EntreeCodex) => ordre === 'fasc' && replies.has(e.fascicule)

  const dansFascicule = entrees.filter((e) => fascicule === 'tous' || e.fascicule === fascicule)
  const visibles = dansFascicule.filter((e) => filtre === 'tout' || e.type === filtre).sort(tri(ordre, vue.inverse))
  const tout = completude(entrees)
  const resultats = rechercher(entrees, recherche)
  const enRecherche = recherche.trim() !== ''
  const dernieres = recentes(entrees)
  const lesFamilles = familles(entrees, jeu)
  const aCompleter = lesFamilles.filter((f) => f.trouves < f.mots.length)
  const detail = lesFamilles.find((f) => f.brique.id === familleChoisie) ?? aCompleter[0] ?? lesFamilles[0]
  const langues = entrees.filter((e) => e.type === 'langue')

  // Précédente et suivante : l'ordre de ce qui est affiché.
  const sequence = enRecherche
    ? resultats.flatMap((g) => g.entrees)
    : vue.vue === 'recentes'
      ? dernieres
      : vue.vue === 'familles'
        ? lesFamilles.flatMap((f) => f.mots)
        : vue.vue === 'objectifs'
          ? (detail?.mots ?? [])
          : visibles.filter((e) => !replie(e))

  const ouvrir = (id: string) => setOuverte(id)
  const naviguer = (id: string) => {
    setFil([])
    ouvrir(id)
  }
  const suivreLien = (id: string) => {
    if (ouverte) setFil((f) => [...f, ouverte])
    ouvrir(id)
  }
  const remonter = (rang: number) => {
    const id = fil[rang]
    if (!id) return
    setFil((f) => f.slice(0, rang))
    ouvrir(id)
  }
  const fermer = () => {
    setOuverte(null)
    setFil([])
  }
  const carteOuverte = ouverte ? entrees.find((e) => e.id === ouverte) : undefined

  // Une carte ouverte, par un clic ou par l'URL (rechargement), n'est plus nouvelle.
  useEffect(() => {
    if (carteOuverte) onVue(carteOuverte.id)
  }, [carteOuverte, onVue])

  // « / » place le curseur dans la recherche, comme dans la réserve (I-17).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null
      if (e.key !== '/' || cible?.tagName === 'INPUT' || ouverte) return
      // Écran caché (autre onglet) : la réserve de la table prend le raccourci.
      if (!champ.current || champ.current.closest('[hidden]')) return
      e.preventDefault()
      champ.current.focus()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [ouverte])

  const mini = (e: EntreeCodex) => (
    <Mini key={e.id} entree={e} nouvelle={nouvelles.has(e.id)} langue={e.langueId ? (jeu.langues.get(e.langueId) ?? null) : null} onOuvrir={() => naviguer(e.id)} />
  )

  return (
    <LectureMedia.Provider value={lireMedia}>
    <div className="codex-browser">
      <div className="cb-head">
        <div>
          <h2 className="cb-title">
            {enRecherche ? (
              <>
                Recherche <em>dans le codex</em>
              </>
            ) : vue.vue === 'recentes' ? (
              <>
                Découvertes <em>récentes</em>
              </>
            ) : (
              <>
                Vue <em>{{ tout: 'globale', familles: 'des familles', objectifs: 'des objectifs' }[vue.vue]}</em>
              </>
            )}
          </h2>
        </div>
        <span className="cb-count">
          {tout.trouvees} / {tout.total} cartes découvertes
          {tout.legendaires > 0 && (
            <>
              {' · '}
              <span className="cb-legend">
                <FormeRarete rarete="legendaire" />
                {tout.legendaires}&nbsp;légendaire{tout.legendaires > 1 ? 's' : ''}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="cb-search">
        <label className="champ">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <span className="sr-only">Chercher un mot, une brique ou un sens parmi les cartes découvertes</span>
          <input
            ref={champ}
            type="search"
            placeholder="Chercher un mot, une brique ou un sens"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setRecherche('')
            }}
          />
          <kbd aria-hidden="true">{enRecherche ? 'Échap' : '/'}</kbd>
        </label>
      </div>

      {!enRecherche && (
        <div className="cb-views" role="group" aria-label="Vues du codex">
          {VUES.map(([v, libelle]) => (
            <button key={v} type="button" aria-pressed={vue.vue === v} onClick={() => setVue(v)}>
              {libelle}
              {v === 'familles' && lesFamilles.length > 0 && <b>{lesFamilles.length}</b>}
              {v === 'objectifs' && aCompleter.length > 0 && <b>{aCompleter.length}</b>}
            </button>
          ))}
        </div>
      )}

      {enRecherche ? (
        <div className="cb-results" aria-live="polite">
          {resultats.length === 0 ? (
            <div className="cb-empty">
              <p className="cb-empty-k">Aucun résultat</p>
              <p>Seules les cartes découvertes apparaissent. Essayez un sens, comme «&nbsp;vie&nbsp;» ou «&nbsp;écriture&nbsp;».</p>
              <button type="button" className="btn btn-secondary" onClick={() => setRecherche('')}>
                Effacer la recherche
              </button>
            </div>
          ) : (
            <>
              <div className="cb-grid">
                {resultats.map((g) => (
                  <Fragment key={g.titre}>
                    <div className="cb-group" role="presentation">
                      <b>
                        {g.titre} · {g.entrees.length}
                      </b>
                    </div>
                    {g.entrees.map(mini)}
                  </Fragment>
                ))}
              </div>
              <p className="cb-note">Seules les cartes découvertes apparaissent.</p>
            </>
          )}
        </div>
      ) : vue.vue === 'recentes' ? (
        dernieres.length === 0 ? (
          <div className="cb-empty">
            <p className="cb-empty-k">Aucune découverte pour l’instant</p>
            <p>Vos dernières cartes trouvées apparaîtront ici, la plus récente d’abord.</p>
          </div>
        ) : (
          <>
            <p className="cb-note">
              {dernieres.length < NB_RECENTES ? 'Vos cartes trouvées' : `Vos ${NB_RECENTES} dernières cartes trouvées`}, la plus récente d’abord.
            </p>
            <div className="cb-grid">{dernieres.map(mini)}</div>
          </>
        )
      ) : vue.vue === 'familles' ? (
        lesFamilles.length === 0 ? (
          <div className="cb-empty">
            <p className="cb-empty-k">Aucune famille ouverte</p>
            <p>Chaque brique trouvée ouvre la famille des mots qu’elle forme.</p>
          </div>
        ) : (
          <div className="fam-list">
            {lesFamilles.map((f) => (
              <section key={f.brique.id} className="fam" aria-label={`Famille de ${f.brique.libelle} : ${f.trouves} mots trouvés sur ${f.mots.length}`}>
                <div className="fam-head">
                  <TitreFamille famille={f} />
                  <span className="fam-count">
                    {f.trouves} / {f.mots.length}
                    {f.trouves === f.mots.length ? ' · complète' : ''}
                  </span>
                </div>
                <BarreFamille famille={f} />
                <div className="cb-grid">{f.mots.map(mini)}</div>
              </section>
            ))}
          </div>
        )
      ) : vue.vue === 'objectifs' ? (
        <div className="obj">
          <div className="obj-list">
            <p className="more-k">Familles à compléter</p>
            {aCompleter.length === 0 ? (
              <p className="cb-note">{lesFamilles.length === 0 ? 'Trouvez une brique pour ouvrir sa famille.' : 'Toutes vos familles sont complètes.'}</p>
            ) : (
              aCompleter.map((f) => (
                <button
                  key={f.brique.id}
                  type="button"
                  className="fam fam-btn"
                  aria-pressed={detail?.brique.id === f.brique.id}
                  aria-label={`Famille de ${f.brique.libelle} : ${f.trouves} mots trouvés sur ${f.mots.length}`}
                  onClick={() => setFamilleChoisie(f.brique.id)}
                >
                  <span className="fam-head">
                    <TitreFamille famille={f} />
                    <span className="fam-count">
                      {f.trouves} / {f.mots.length}
                    </span>
                  </span>
                  <BarreFamille famille={f} />
                </button>
              ))
            )}
            <p className="more-k">Langues rencontrées</p>
            <div className="fam">
              <span className="fam-head">
                <span className="fam-name">
                  <b className="fam-word">Langues</b>
                </span>
                <span className="fam-count">
                  {langues.filter((l) => l.trouvee).length} / {langues.length}
                </span>
              </span>
              <span className="fam-bar is-lang" aria-hidden="true">
                <i style={{ width: `${langues.length ? (langues.filter((l) => l.trouvee).length / langues.length) * 100 : 0}%` }} />
              </span>
            </div>
            <p className="more-k">Jalons</p>
            <Jalons jeu={jeu} entrees={entrees} atteints={new Set(jalonsAtteints)} />
            <p className="cb-note">Chaque récompense est annoncée d’avance, jamais tirée au hasard.</p>
          </div>
          {detail && (
            <section ref={detailFamille} className="obj-detail" aria-label={`Famille de ${detail.brique.libelle}`}>
              <p className="more-k">Famille</p>
              <h3 className="obj-title">
                <TitreFamille famille={detail} />
              </h3>
              <p className="cb-note">
                Les mots formés sur {detail.brique.libelle}
                {detail.brique.sens ? <> «&nbsp;{detail.brique.sens}&nbsp;»</> : null} : {detail.trouves} trouvé{detail.trouves > 1 ? 's' : ''} sur {detail.mots.length}.
              </p>
              <div className="cb-grid">{detail.mots.map(mini)}</div>
            </section>
          )}
        </div>
      ) : (
        <>
          <div className="cb-fasc" role="group" aria-label="Complétude par fascicule, touchez pour filtrer">
            {jeu.fascicules.map((f) => {
              const c = completude(entrees.filter((e) => e.fascicule === f.numero))
              const actif = fascicule === f.numero
              return (
                <button
                  key={f.numero}
                  type="button"
                  className="cb-fasc-btn"
                  aria-pressed={actif}
                  aria-label={`${libelleFascicule(f)} : ${c.trouvees} cartes découvertes sur ${c.total}. ${actif ? 'Afficher tous les fascicules' : 'Afficher ce fascicule seulement'}`}
                  onClick={() => setFascicule(actif ? 'tous' : f.numero)}
                >
                  <Jaquette chemin={f.manifeste.jaquette} urlMedia={urlMedia} />
                  <span className="cb-fasc-info">
                  <span className="cb-fasc-head">
                    <TitreFascicule fascicule={f} />
                    <span>{new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(f.parution))}</span>
                  </span>
                  <span className="cb-fasc-bar">
                    <i style={{ width: `${c.total ? (c.trouvees / c.total) * 100 : 0}%` }} />
                  </span>
                  <span className="cb-fasc-count">
                    <b>
                      {c.trouvees} / {c.total}
                    </b>{' '}
                    cartes{c.trouvees === c.total && c.total > 0 ? ' · complet' : ''}
                  </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="cb-toolbar">
            <div className="cb-filters" role="group" aria-label="Filtrer les cartes par type">
              {(['tout', ...ORDRE_TYPES] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="cb-chip"
                  aria-pressed={filtre === t}
                  onClick={() => setFiltre(t)}
                  style={t === 'tout' ? undefined : ({ '--c': (bandeau(t) as Record<string, string>)['--tc'] } as React.CSSProperties)}
                >
                  {t !== 'tout' && <i />}
                  <span>{t === 'tout' ? 'Tout' : TYPES[t].pluriel}</span>
                  <b>{dansFascicule.filter((e) => t === 'tout' || e.type === t).length}</b>
                </button>
              ))}
            </div>
            <div className="cb-sort-wrap">
              <span className="cb-sort-label">Trier</span>
              <div className="cb-sort" role="group" aria-label="Trier les cartes">
                {TRIS.map(([t, libelle]) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={ordre === t}
                    aria-label={ordre === t ? `${libelle}, ordre ${vue.inverse ? 'inverse' : 'croissant'} : toucher pour inverser` : undefined}
                    onClick={() => setOrdre(t)}
                  >
                    {/* L'alphabet dit lui-même son sens : « Z → A » plutôt qu'une flèche de plus. */}
                    {t === 'az' && ordre === t && vue.inverse ? 'Z → A' : libelle}
                    {ordre === t && t !== 'az' && (
                      <span className="cb-sort-dir" aria-hidden="true">
                        {vue.inverse ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="cb-grid">
            {visibles.map((e, i) => {
              const precedente = visibles[i - 1]
              const paru = jeu.fascicules.find((f) => f.numero === e.fascicule)
              const titre =
                ordre === 'fasc' && (!precedente || precedente.fascicule !== e.fascicule)
                  ? completude(dansFascicule.filter((x) => x.fascicule === e.fascicule))
                  : null
              return (
                <Fragment key={e.id}>
                  {titre && (
                    <button
                      type="button"
                      className="cb-group cb-group-btn"
                      aria-expanded={!replie(e)}
                      aria-label={`${paru ? libelleFascicule(paru) : `Fascicule n° ${e.fascicule}`} : ${titre.trouvees} cartes découvertes sur ${titre.total}. ${replie(e) ? 'Déplier' : 'Replier'} le groupe`}
                      onClick={() => basculerGroupe(e.fascicule)}
                    >
                      <b>
                        <span className="cb-chev" aria-hidden="true">
                          ›
                        </span>
                        <Jaquette chemin={paru?.manifeste.jaquette} urlMedia={urlMedia} petite />
                        {paru ? <TitreFascicule fascicule={paru} /> : `Fascicule n° ${e.fascicule}`}
                      </b>
                      <span>
                        {titre.trouvees} / {titre.total} cartes
                      </span>
                    </button>
                  )}
                  {!replie(e) && mini(e)}
                </Fragment>
              )
            })}
          </div>
        </>
      )}

      {carteOuverte && (
        <Visionneuse
          key={carteOuverte.id}
          entrees={sequence.length > 0 ? sequence : visibles}
          toutes={entrees}
          entree={carteOuverte}
          fil={fil.flatMap((id) => entrees.filter((e) => e.id === id))}
          jeu={jeu}
          onNaviguer={naviguer}
          onSuivreLien={suivreLien}
          onRemonter={remonter}
          onFermer={fermer}
          plus={vue.plus}
          onPlus={(plus) => onChangerVue({ plus }, { remplacer: true })}
        />
      )}
    </div>
    </LectureMedia.Provider>
  )
}

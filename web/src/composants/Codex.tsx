import { Fragment, cloneElement, useEffect, useRef, useState } from 'react'

import {
  CONFIANCES,
  type EntreeCodex,
  ORDRE_TYPES,
  TYPES,
  type TypeCarte,
  completude,
  silhouetteDe,
} from '../services/codex'
import type { CatalogueJeu } from '../services/jeu'
import { NATURES } from '../services/jeu'
import { MotSegmente } from './MotSegmente'
import { FormeRarete } from './Rarete'

type Tri = 'n' | 'az' | 'type' | 'fasc'
const TRIS: [Tri, string][] = [
  ['n', 'N°'],
  ['az', 'A → Z'],
  ['type', 'Type'],
  ['fasc', 'Fascicule'],
]

const numero = (n: number) => `N°\u00a0${String(n).padStart(3, '0')}`

/** Bandeau : couleur du type de ressource ; Encre pour un mot (identité, « une couleur, un seul sens »). */
function bandeau(type: TypeCarte): React.CSSProperties {
  const couleurs: Record<TypeCarte, [string, string]> = {
    mot: ['var(--fixed-ink)', '#f3eee3'],
    prefixe: ['var(--c-prefix)', 'var(--fixed-ink)'],
    suffixe: ['var(--c-suffix)', 'var(--fixed-ink)'],
    langue: ['var(--c-lang)', 'var(--fixed-ink)'],
  }
  const [tc, tt] = couleurs[type]
  return { '--tc': tc, '--tt': tt } as React.CSSProperties
}

/** Texture de carte (ADR 0023) : silhouette d'une seule teinte, seulement une fois la carte trouvée. */
function Texture({ entree }: { entree: EntreeCodex }) {
  if (!entree.trouvee || !entree.silhouette) return null
  return <span className="card-art" aria-hidden="true" style={{ '--art': `url("${entree.silhouette}")` } as React.CSSProperties} />
}

function Brique({ libelle, nature, className = 'bchip' }: { libelle: string; nature: string; className?: string }) {
  return (
    <span className={className} data-kind={nature}>
      {libelle}
    </span>
  )
}

const tri = (t: Tri) => (a: EntreeCodex, b: EntreeCodex) => {
  const cle = (e: EntreeCodex) => (e.trouvee ? e.libelle.replace(/^-/, '') : '')
  switch (t) {
    case 'n':
      return a.n - b.n
    case 'az':
      return Number(!a.trouvee) - Number(!b.trouvee) || cle(a).localeCompare(cle(b), 'fr', { sensitivity: 'base' })
    case 'type':
      return ORDRE_TYPES.indexOf(a.type) - ORDRE_TYPES.indexOf(b.type) || a.n - b.n
    case 'fasc':
      return a.fascicule - b.fascicule || Number(!a.trouvee) - Number(!b.trouvee) || a.n - b.n
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
          {entree.type === 'langue' && <span className="m-glyph">{entree.libelle.charAt(0)}</span>}
          {affixe ? (
            <Brique libelle={entree.libelle} nature={NATURES[entree.type as 'prefixe' | 'suffixe']} className="bchip m-brick" />
          ) : entree.type !== 'langue' ? (
            <span className="m-word">{entree.libelle}</span>
          ) : null}
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
}

/** Carte agrandie (I-15) : recto, puis verso retourné, précédente et suivante au clavier. */
function Visionneuse({ entrees, toutes, entree, fil, jeu, onNaviguer, onSuivreLien, onRemonter, onFermer }: VisionneuseProps) {
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

  const haut = (
    <div className="bf-top">
      <span>{numero(entree.n)}</span>
      <span className="bf-type">{type.libelle}</span>
    </div>
  )

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={entree.trouvee ? entree.libelle : `Carte ${entree.n}`}>
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
                  {entree.type === 'langue' && <p className="bf-glyph">{entree.libelle.charAt(0)}</p>}
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
                        {entree.type !== 'langue' && lier(<span className="f-lang">{jeu.langues.get(f.langueId)}</span>, f.langueId, jeu.langues.get(f.langueId) ?? '')}
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
                          {lier(<span className={l.trouve ? 'bchip' : 'bchip missing'} data-kind={NATURES[l.nature]}>{l.libelle}</span>, l.id, l.libelle)}
                        </Fragment>
                      ) : (
                        <Fragment key={i}>
                          {lier(<span className={l.trouve ? 'bb-link' : 'bb-link missing'}>{l.trouve ? l.libelle : silhouetteDe(l.libelle)}</span>, l.id, l.libelle)}
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
      <button className="viewer-nav next" type="button" onClick={() => voisine(1)} aria-label="Carte suivante">
        →
      </button>
      <p className="viewer-hint">← → pour changer de carte · Échap pour fermer</p>
    </div>
  )
}

interface Props {
  entrees: EntreeCodex[]
  jeu: CatalogueJeu
  nouvelles: Set<string>
  onVue: (id: string) => void
  /** Carte à ouvrir dès l'arrivée dans le codex (depuis la table), puis `onOuverte`. */
  aOuvrir?: string | null
  onOuverte?: () => void
  /** Adresse d'un média du catalogue (jaquette d'un fascicule). */
  urlMedia: (chemin: string) => string
}

/** Codex, vue globale (I-14, codex.html) : complétude par fascicule, filtres par type, tri, cartes et carte agrandie. */
export function Codex({ entrees, jeu, nouvelles, onVue, aOuvrir, onOuverte, urlMedia }: Props) {
  const [filtre, setFiltre] = useState<TypeCarte | 'tout'>('tout')
  const [ordre, setOrdre] = useState<Tri>('n')
  const [fascicule, setFascicule] = useState<number | 'tous'>('tous')
  const [ouverte, setOuverte] = useState<string | null>(null)
  /** Fil d'Ariane : cartes quittées en suivant un lien, de la plus ancienne à la plus récente. */
  const [fil, setFil] = useState<string[]>([])

  const dansFascicule = entrees.filter((e) => fascicule === 'tous' || e.fascicule === fascicule)
  const visibles = dansFascicule.filter((e) => filtre === 'tout' || e.type === filtre).sort(tri(ordre))
  const tout = completude(entrees)
  const ouvrir = (id: string) => {
    setOuverte(id)
    onVue(id)
  }
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

  // Ouvrir une carte demandée depuis la table : tous les filtres sont levés pour la montrer.
  useEffect(() => {
    if (!aOuvrir) return
    const existe = entrees.some((e) => e.id === aOuvrir)
    // oxlint-disable-next-line react/set-state-in-effect -- réponse à une demande de navigation venue d'un autre écran.
    setFiltre('tout')
    setOrdre('n')
    setFascicule('tous')
    setFil([])
    if (existe) {
      setOuverte(aOuvrir)
      onVue(aOuvrir)
    }
    onOuverte?.()
  }, [aOuvrir, entrees, onVue, onOuverte])

  return (
    <div className="codex-browser">
      <div className="cb-head">
        <div>
          <h2 className="cb-title">
            Vue <em>globale</em>
          </h2>
          <p className="cb-sub">Touchez une carte pour l’agrandir, puis retournez-la pour voir toutes les formes trouvées. Touchez un fascicule pour n’afficher que ses cartes.</p>
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
              aria-label={`Fascicule ${f.numero} : ${c.trouvees} cartes découvertes sur ${c.total}. ${actif ? 'Afficher tous les fascicules' : 'Afficher ce fascicule seulement'}`}
              onClick={() => setFascicule(actif ? 'tous' : f.numero)}
            >
              <span className={f.manifeste.jaquette ? 'jk-mini' : 'jk-mini is-empty'} aria-hidden="true">
                {f.manifeste.jaquette && (
                  <span className="jk-art">
                    <img src={urlMedia(f.manifeste.jaquette)} alt="" decoding="async" />
                  </span>
                )}
              </span>
              <span className="cb-fasc-info">
              <span className="cb-fasc-head">
                <b>Fascicule {f.numero}</b>
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
              <button key={t} type="button" aria-pressed={ordre === t} onClick={() => setOrdre(t)}>
                {libelle}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="cb-grid">
        {visibles.map((e, i) => {
          const precedente = visibles[i - 1]
          const titre =
            ordre === 'fasc' && (!precedente || precedente.fascicule !== e.fascicule)
              ? completude(dansFascicule.filter((x) => x.fascicule === e.fascicule))
              : null
          return (
            <Fragment key={e.id}>
              {titre && (
                <div className="cb-group" role="presentation">
                  <b>Fascicule {e.fascicule}</b>
                  <span>
                    {titre.trouvees} / {titre.total} cartes
                  </span>
                </div>
              )}
              <Mini entree={e} nouvelle={nouvelles.has(e.id)} langue={e.langueId ? (jeu.langues.get(e.langueId) ?? null) : null} onOuvrir={() => naviguer(e.id)} />
            </Fragment>
          )
        })}
      </div>

      {carteOuverte && (
        <Visionneuse
          key={carteOuverte.id}
          entrees={visibles}
          toutes={entrees}
          entree={carteOuverte}
          fil={fil.flatMap((id) => entrees.filter((e) => e.id === id))}
          jeu={jeu}
          onNaviguer={naviguer}
          onSuivreLien={suivreLien}
          onRemonter={remonter}
          onFermer={fermer}
        />
      )}
    </div>
  )
}

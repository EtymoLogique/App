import { Fragment, useEffect, useRef, useState } from 'react'

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

function Mini({ entree, nouvelle, langue, onOuvrir }: { entree: EntreeCodex; nouvelle: boolean; langue: string | null; onOuvrir: () => void }) {
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
  entrees: EntreeCodex[]
  index: number
  jeu: CatalogueJeu
  onNaviguer: (index: number) => void
  onFermer: () => void
}

/** Carte agrandie (I-15) : recto, puis verso retourné, précédente et suivante au clavier. */
function Visionneuse({ entrees, index, jeu, onNaviguer, onFermer }: VisionneuseProps) {
  const [retournee, setRetournee] = useState(false)
  const fermer = useRef<HTMLButtonElement>(null)
  const entree = entrees[index]
  useEffect(() => {
    fermer.current?.focus()
  }, [])
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer()
      else if (e.key === 'ArrowLeft') onNaviguer((index - 1 + entrees.length) % entrees.length)
      else if (e.key === 'ArrowRight') onNaviguer((index + 1) % entrees.length)
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [index, entrees.length, onFermer, onNaviguer])
  if (!entree) return null
  const type = TYPES[entree.type]
  const langue = entree.langueId ? jeu.langues.get(entree.langueId) : null
  const affixe = entree.type === 'prefixe' || entree.type === 'suffixe'
  const trouvees = entree.formes.filter((f) => f.trouvee).length
  const composition = entree.carte?.compositions?.find((c) => c.preferee) ?? entree.carte?.compositions?.[0]
  const note = composition?.libelles.fr?.explication_courte ?? null
  const partie = (id: string) => [...jeu.briques.values()].find((b) => b.uniteId === id)
  const parties = [...(composition?.parties ?? [])].sort((a, b) => a.rang - b.rang)

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
      <button className="viewer-nav prev" type="button" onClick={() => onNaviguer((index - 1 + entrees.length) % entrees.length)} aria-label="Carte précédente">
        ←
      </button>
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
                    <p className="bf-word" aria-label={entree.libelle}>
                      <MotSegmente
                        mot={entree.libelle}
                        morceaux={parties.flatMap((p) => {
                          const nature = jeu.cartes.get(p.unite_id)?.nature
                          return p.segment_debut != null && p.segment_fin != null && nature ? [{ debut: p.segment_debut, fin: p.segment_fin, nature }] : []
                        })}
                      />
                    </p>
                  )}
                  {entree.type !== 'langue' && langue && (
                    <p className="bf-lang">
                      <i />
                      {langue}
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
                            {b && (
                              <span className="brick s" data-kind={NATURES[b.nature]}>
                                <span className="b-label">{b.libelle}</span>
                                <span className="b-meta">
                                  {NATURES[b.nature]}
                                  {b.glose && <> · «&nbsp;{b.glose}&nbsp;»</>}
                                </span>
                              </span>
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
                              {f.dans && <>dans {f.dans}</>}
                            </span>
                          )}
                          {!f.trouvee && <span className="f-tr">À découvrir</span>}
                        </span>
                        {entree.type !== 'langue' && <span className="f-lang">{jeu.langues.get(f.langueId)}</span>}
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
                        <Brique key={i} libelle={l.libelle} nature={NATURES[l.nature]} className={l.trouve ? 'bchip' : 'bchip missing'} />
                      ) : (
                        <span key={i} className={l.trouve ? 'bb-link' : 'bb-link missing'}>
                          {l.trouve ? l.libelle : silhouetteDe(l.libelle)}
                        </span>
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
      <button className="viewer-nav next" type="button" onClick={() => onNaviguer((index + 1) % entrees.length)} aria-label="Carte suivante">
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
}

/** Codex, vue globale (I-14, codex.html) : complétude par fascicule, filtres par type, tri, cartes et carte agrandie. */
export function Codex({ entrees, jeu, nouvelles, onVue }: Props) {
  const [filtre, setFiltre] = useState<TypeCarte | 'tout'>('tout')
  const [ordre, setOrdre] = useState<Tri>('n')
  const [fascicule, setFascicule] = useState<number | 'tous'>('tous')
  const [ouverte, setOuverte] = useState<number | null>(null)

  const dansFascicule = entrees.filter((e) => fascicule === 'tous' || e.fascicule === fascicule)
  const visibles = dansFascicule.filter((e) => filtre === 'tout' || e.type === filtre).sort(tri(ordre))
  const tout = completude(entrees)
  const ouvrir = (i: number) => {
    setOuverte(i)
    const e = visibles[i]
    if (e) onVue(e.id)
  }

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
              <Mini entree={e} nouvelle={nouvelles.has(e.id)} langue={e.langueId ? (jeu.langues.get(e.langueId) ?? null) : null} onOuvrir={() => ouvrir(i)} />
            </Fragment>
          )
        })}
      </div>

      {ouverte !== null && (
        <Visionneuse key={visibles[ouverte]?.id} entrees={visibles} index={ouverte} jeu={jeu} onNaviguer={ouvrir} onFermer={() => setOuverte(null)} />
      )}
    </div>
  )
}

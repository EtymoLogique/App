import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { Exemplaires } from '../contrat'
import { mouvementReduit } from '../services/animation'
import type { BriqueJeu } from '../services/jeu'
import { NATURES, entrelacer, naturesDeCase } from '../services/jeu'
import { correspond } from '../services/recherche'
import { ContenuBrique, PetiteBrique } from './Brique'

export const TYPE_GLISSE = 'application/x-etymo-brique'

type Filtre = 'tout' | 'prefixe' | 'suffixe' | 'recentes'

/** Briques obtenues depuis moins de 24 h : le filtre « Récentes ». */
const RECENTE_MS = 24 * 60 * 60 * 1000

interface Props {
  reserve: Exemplaires[]
  briques: Map<string, BriqueJeu>
  table: string[]
  /** Case visée sur la table : seuls les mots et les préfixes (gauche) ou les suffixes (droite) s'affichent. */
  zone?: number | null
  /** `depuis` : la brique touchée, d'où l'exemplaire vole jusqu'à sa case. */
  onAjouter: (brique: string, depuis?: HTMLElement) => void
  /** Message affiché quand on touche une brique indisponible, sans secousse. */
  onIndisponible: (message: string) => void
  /** Briques qui viennent d'être consommées : un « −1 » s'envole au-dessus. */
  consommees?: string[]
  /** Dernière brique posée ou retirée : sa pastille se contracte (−1) ou gonfle (+1), à chaque nouvelle `cle`. */
  touchee?: { brique: string; cle: number; sens: 'plus' | 'moins' } | null
  /**
   * Mémoire des essais (App#89) : la brique posée sur la table, et pourquoi chaque brique
   * a déjà été essayée avec elle (« aucune recette », « au codex »), ou `null`.
   */
  memoire?: { posee: string; raison: (brique: string) => string | null } | null
}

/** Largeur relative d'une brique : son libellé (serif, grand) ou sa ligne de type et de sens (mono, petite). */
function encombrement(b: BriqueJeu): number {
  return Math.max(b.libelle.length * 1.6, `${NATURES[b.nature]} · « ${b.glose ?? ''} »`.length)
}

function exemplaires(n: number): string {
  return `${n} exemplaire${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}`
}

/**
 * Réserve (maquette I-09) : recherche par brique ou par sens, filtres, tri
 * par briques disponibles puis récentes. Un toucher ou un clic pose la brique sur la table
 * (jeu.html) ; on peut aussi la glisser sur un emplacement.
 */
export function Reserve({ reserve, briques, table, zone = null, onAjouter, onIndisponible, consommees = [], touchee = null, memoire = null }: Props) {
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('tout')
  const champ = useRef<HTMLInputElement>(null)
  const [maintenant] = useState(() => Date.now())

  // « / » place le curseur dans la recherche (maquette ordinateur).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null
      // Écran caché (autre onglet) : le codex prend le raccourci.
      if (e.key === '/' && cible?.tagName !== 'INPUT' && champ.current && !champ.current.closest('[hidden]')) {
        e.preventDefault()
        champ.current?.focus()
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [])

  const connues = useMemo(
    () =>
      reserve
        .filter((e) => briques.has(e.brique_id))
        .sort((a, b) => Date.parse(b.connue_le) - Date.parse(a.connue_le) || a.brique_id.localeCompare(b.brique_id)),
    [reserve, briques],
  )
  const dansLeFiltre = (e: Exemplaires, f: Filtre) => {
    const b = briques.get(e.brique_id) as BriqueJeu
    if (f === 'prefixe' || f === 'suffixe') return b.nature === f
    if (f === 'recentes') return maintenant - Date.parse(e.connue_le) < RECENTE_MS
    return true
  }
  // Une case visée choisit déjà les natures : les filtres Préfixes et Suffixes s'effacent devant elle.
  const filtreActif = zone !== null && (filtre === 'prefixe' || filtre === 'suffixe') ? 'tout' : filtre
  const disponibles = (id: string) => (reserve.find((e) => e.brique_id === id)?.exemplaires ?? 0) - table.filter((b) => b === id).length

  // Les briques possédées passent devant, les épuisées ferment la marche ; l'entrelacement long/court
  // se fait dans chaque groupe, l'ordre « récentes d'abord » départage le reste.
  // Une brique posée sur la table reste à sa place, grisée : rien ne bouge sous les doigts.
  const trouvees = connues.filter((e) => {
    const b = briques.get(e.brique_id) as BriqueJeu
    return (zone === null || naturesDeCase(zone).includes(b.nature)) && dansLeFiltre(e, filtreActif) && correspond(recherche, b.libelle, b.glose)
  })
  const taille = (e: Exemplaires) => encombrement(briques.get(e.brique_id) as BriqueJeu)
  // Mémoire des essais : les briques déjà essayées avec celle de la table passent en fin de liste, grisées.
  // Les autres gardent l'ordre habituel : rien ne dit qu'une paire jamais essayée est bonne.
  const raisons = new Map(
    memoire
      ? trouvees.flatMap((e) => {
          const r = memoire.raison(e.brique_id)
          return r ? [[e.brique_id, r] as const] : []
        })
      : [],
  )
  const ordonner = (liste: Exemplaires[]) => [
    ...entrelacer(liste.filter((e) => e.exemplaires > 0), taille),
    ...entrelacer(liste.filter((e) => e.exemplaires <= 0), taille),
  ]
  const visibles = ordonner(trouvees.filter((e) => !raisons.has(e.brique_id)))
  const essayees = ordonner(trouvees.filter((e) => raisons.has(e.brique_id)))

  // Les briques glissent vers leur nouvelle place quand la partition change (FLIP, 240 ms).
  const plateau = useRef<HTMLDivElement>(null)
  const places = useRef(new Map<string, DOMRect>())
  const partition = [...raisons.keys()].sort().join(' ')
  const partitionAvant = useRef(partition)
  useLayoutEffect(() => {
    const boutons = plateau.current?.querySelectorAll<HTMLElement>('[data-brique]') ?? []
    const anime = partitionAvant.current !== partition && !mouvementReduit()
    partitionAvant.current = partition
    const suivantes = new Map<string, DOMRect>()
    for (const el of boutons) {
      const id = el.dataset.brique ?? ''
      const apres = el.getBoundingClientRect()
      suivantes.set(id, apres)
      const avant = places.current.get(id)
      if (!anime || !avant || typeof el.animate !== 'function') continue
      const dx = avant.left - apres.left
      const dy = avant.top - apres.top
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
    }
    places.current = suivantes
  })

  return (
    <>
      <label className="champ">
        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <span className="sr-only">Chercher une brique ou un sens</span>
        <input
          ref={champ}
          type="search"
          placeholder="Chercher une brique ou un sens"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <kbd aria-hidden="true">/</kbd>
      </label>
      <div className="filtres" role="group" aria-label="Filtrer la réserve">
        {(
          [
            ['tout', 'Tout', null],
            ['prefixe', 'Préfixes', 'var(--c-prefix)'],
            ['suffixe', 'Suffixes', 'var(--c-suffix)'],
            ['recentes', 'Récentes', null],
          ] as [Filtre, string, string | null][]
        )
          .filter(([f]) => zone === null || (f !== 'prefixe' && f !== 'suffixe'))
          .map(([f, libelle, couleur]) => (
          <button
            key={f}
            type="button"
            className="cb-chip"
            aria-pressed={filtreActif === f}
            onClick={() => setFiltre(f)}
            style={couleur ? ({ '--c': couleur } as React.CSSProperties) : undefined}
          >
            {couleur && <i />}
            <span>{libelle}</span>
            {f === 'tout' && <b>{connues.length}</b>}
          </button>
        ))}
      </div>

      {connues.length === 0 ? (
        <p className="panel-tip">Votre réserve est vide pour le moment.</p>
      ) : visibles.length + essayees.length === 0 ? (
        <p className="panel-tip">Aucune brique ne correspond. Essayez un sens, comme « vie » ou « terre ».</p>
      ) : (
        <div ref={plateau} className="tray-memoire">
          {[visibles, essayees].map((liste, rangListe) =>
            liste.length === 0 ? null : (
              <div key={rangListe}>
                {rangListe === 1 && memoire && briques.get(memoire.posee) && (
                  <p className="tray-intertitre">
                    Déjà essayées avec <PetiteBrique brique={briques.get(memoire.posee) as BriqueJeu} /> · {essayees.length}
                  </p>
                )}
                <ul className="tray" aria-label={rangListe === 0 ? 'Briques de la réserve' : 'Briques déjà essayées avec celle de la table'}>
                  {liste.map(({ brique_id, exemplaires: possedes }) => {
                    const brique = briques.get(brique_id) as BriqueJeu
                    const libres = disponibles(brique_id)
                    const epuisee = possedes === 0
                    const indisponible = epuisee
                      ? `Plus aucun exemplaire de ${brique.libelle}. Ouvrez un pli pour en retrouver.`
                      : libres <= 0
                        ? `Tous vos exemplaires de ${brique.libelle} sont déjà sur la table.`
                        : null
                    const nom = `${brique.libelle}${brique.glose ? ` (${brique.glose})` : ''}`
                    const raison = raisons.get(brique_id)
                    const classes = ['brick', epuisee ? 'is-spent' : libres <= 0 ? 'is-out' : '', raison ? 'is-essayee' : ''].filter(Boolean).join(' ')
                    return (
                      <li key={brique_id}>
                        <button
                          type="button"
                          className={classes}
                          data-kind={NATURES[brique.nature]}
                          data-brique={brique_id}
                          aria-disabled={indisponible !== null}
                          aria-label={
                            epuisee
                              ? `${nom} : épuisée. Revient dans les plis`
                              : libres <= 0
                                ? `${nom} : tous vos exemplaires sont sur la table`
                                : `Poser ${nom} sur la table. ${exemplaires(libres)}${raison ? `. Déjà essayée : ${raison}` : ''}`
                          }
                          draggable={indisponible === null}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(TYPE_GLISSE, brique_id)
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                          onClick={(e) => (indisponible === null ? onAjouter(brique_id, e.currentTarget) : onIndisponible(indisponible))}
                        >
                          {raison ? (
                            <>
                              <span className="b-label" lang="fr">
                                {brique.libelle}
                              </span>
                              <span className="b-meta">{raison}</span>
                            </>
                          ) : (
                            <ContenuBrique brique={brique} />
                          )}
                          {brique.nature !== 'mot' && (
                            <span
                              key={touchee?.brique === brique_id ? touchee.cle : 0}
                              className={['b-count', epuisee ? 'zero' : '', touchee?.brique === brique_id ? `rebond ${touchee.sens}` : ''].filter(Boolean).join(' ')}
                              aria-hidden="true"
                            >
                              {epuisee ? 'épuisée' : `×${Math.max(libres, 0)}`}
                            </span>
                          )}
                          {consommees.includes(brique_id) && (
                            <span className="b-minus" aria-hidden="true">
                              −1
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ),
          )}
        </div>
      )}
    </>
  )
}

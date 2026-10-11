import { useEffect, useRef, useState } from 'react'
import { type EntreeCodex, completude } from '../services/codex'
import { type CatalogueJeu, type FasciculeParu, libelleFascicule } from '../services/jeu'

/** Miniature de la jaquette d'un fascicule, décorative : son numéro est écrit à côté. */
export function Jaquette({ chemin, urlMedia, petite = false }: { chemin: string | null | undefined; urlMedia: (chemin: string) => string; petite?: boolean }) {
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
export function TitreFascicule({ fascicule }: { fascicule: FasciculeParu }) {
  return (
    <span className="fasc-titre">
      <span className="fasc-nom">{fascicule.manifeste.nom ?? 'Fascicule'}</span>
      <span className="fasc-num">N°&nbsp;{fascicule.numero}</span>
    </span>
  )
}

interface Props {
  jeu: CatalogueJeu
  entrees: EntreeCodex[]
  /** Fascicule filtré, ou tous. */
  actif: number | 'tous'
  onChoisir: (fascicule: number | 'tous') => void
  urlMedia: (chemin: string) => string
  /** Récompenses qui attendent le joueur dans chaque fascicule : compteur Corail. */
  aRecuperer?: (fascicule: FasciculeParu) => number
}

/**
 * Sélecteur de fascicule, commun au codex et aux quêtes : jaquette, nom,
 * parution et complétude. Toucher un fascicule le filtre ; le toucher à
 * nouveau affiche tous les fascicules.
 */
export function SelecteurFascicules({ jeu, entrees, actif, onChoisir, urlMedia, aRecuperer }: Props) {
  const bande = useRef<HTMLDivElement>(null)
  const [peut, setPeut] = useState({ gauche: false, droite: false })
  // Chevrons : seulement du côté où la bande a encore de quoi défiler.
  useEffect(() => {
    const el = bande.current
    if (!el) return
    const maj = () =>
      setPeut({
        gauche: el.scrollLeft > 4,
        droite: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      })
    maj()
    el.addEventListener('scroll', maj, { passive: true })
    const ro = new ResizeObserver(maj)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', maj)
      ro.disconnect()
    }
  }, [jeu.fascicules.length])
  const defiler = (sens: -1 | 1) =>
    bande.current?.scrollBy({
      left: sens * bande.current.clientWidth * 0.8,
      behavior: 'smooth',
    })
  return (
    <div className="cb-fasc-wrap">
      {(['gauche', 'droite'] as const).map((cote) =>
        peut[cote] ? (
          <button
            key={cote}
            type="button"
            className={`cb-fasc-nav is-${cote}`}
            aria-label={cote === 'gauche' ? 'Fascicules précédents' : 'Fascicules suivants'}
            onClick={() => defiler(cote === 'gauche' ? -1 : 1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={cote === 'gauche' ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6'} />
            </svg>
          </button>
        ) : null,
      )}
      <div ref={bande} className="cb-fasc" role="group" aria-label="Complétude par fascicule, touchez pour filtrer">
        {[...jeu.fascicules]
          .sort((a, b) => b.numero - a.numero)
          .map((f, rang) => {
            const c = completude(entrees.filter((e) => e.fascicule === f.numero))
            const choisi = actif === f.numero
            const recompenses = aRecuperer?.(f) ?? 0
            return (
              <button
                key={f.numero}
                type="button"
                className="cb-fasc-btn"
                aria-pressed={choisi}
                aria-label={`${libelleFascicule(f)}\u00a0: ${c.trouvees} cartes découvertes sur ${c.total}${recompenses > 0 ? `, ${recompenses} récompense${recompenses > 1 ? 's' : ''} à récupérer` : ''}. ${choisi ? 'Afficher tous les fascicules' : 'Afficher ce fascicule seulement'}`}
                onClick={() => onChoisir(choisi ? 'tous' : f.numero)}
              >
                <Jaquette chemin={f.manifeste.jaquette} urlMedia={urlMedia} />
                <span className="cb-fasc-info">
                  <span className="cb-fasc-head">
                    <TitreFascicule fascicule={f} />
                    <span>
                      {new Intl.DateTimeFormat('fr-FR', {
                        month: 'long',
                        year: 'numeric',
                      }).format(new Date(f.parution))}
                    </span>
                  </span>
                  <span className="cb-fasc-bar">
                    {/* --i : la barre se remplit à l'arrivée, après celle du fascicule précédent (codex.css). */}
                    <i
                      style={
                        {
                          width: `${c.total ? (c.trouvees / c.total) * 100 : 0}%`,
                          '--i': rang,
                        } as React.CSSProperties
                      }
                    />
                  </span>
                  <span className="cb-fasc-count">
                    <b>
                      {c.trouvees} / {c.total}
                    </b>{' '}
                    cartes
                    {c.trouvees === c.total && c.total > 0 ? ' · complet' : ''}
                  </span>
                </span>
                {recompenses > 0 && (
                  <span className="count cb-fasc-pastille" aria-hidden="true">
                    {recompenses}
                  </span>
                )}
              </button>
            )
          })}
      </div>
    </div>
  )
}

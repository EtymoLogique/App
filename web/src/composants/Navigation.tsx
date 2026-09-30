import { useEffect, useId, useRef, useState } from 'react'

import type { Onglet } from '../services/route'
import { Anneau } from './Anneau'
import { Compteur } from './Compteur'
import { Icone, type NomIcone } from './Icone'
import { Sablier } from './Sabliers'

export type { Onglet }

type Entree = { id: Onglet; libelle: string; icone: NomIcone }

const ONGLETS: Entree[] = [
  { id: 'table', libelle: 'Table', icone: 'table' },
  { id: 'plis', libelle: 'Plis', icone: 'pli' },
  { id: 'codex', libelle: 'Codex', icone: 'codex' },
  { id: 'boutique', libelle: 'Boutique', icone: 'boutique' },
  { id: 'reglages', libelle: 'Réglages', icone: 'reglages' },
]

/** Sur mobile, la barre porte 4 boutons au plus : au-delà, les entrées d'indice ≥ 3 passent dans le burger. */
const MAX_MOBILE = 4

interface Props {
  onglets?: Entree[]
  actif: Onglet
  /** Nouveautés à signaler par un compteur Corail, par destination. */
  compteurs: Partial<Record<Onglet, number>>
  onChoisir: (onglet: Onglet) => void
  /** Ressources du joueur, affichées au-dessus des réglages ; absentes tant que l'état n'est pas chargé. */
  ressources?: { plis: number; capacite: number; gouttes: number; sabliers: number; recharge: number | null; avance: boolean }
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Ressources du joueur en un coup d'œil : plis prêts, gouttes, sabliers. */
function Ressources({ plis, capacite, gouttes, sabliers, recharge, avance }: NonNullable<Props['ressources']>) {
  return (
    <ul className="navigation-ressources" aria-label="Vos ressources">
      <li aria-label={`${pluriel(plis, 'pli')} prêt${plis > 1 ? 's' : ''} sur ${capacite}`} title="Plis prêts">
        <Icone nom="pli" />
        <span className="navigation-plis">
          {plis}/{capacite}
          {/* Recharge du prochain pli, en petit ; absente quand l'énergie est pleine. */}
          {recharge !== null && <Anneau className="navigation-recharge" progression={recharge} avance={avance} />}
        </span>
      </li>
      <li aria-label={pluriel(gouttes, 'goutte')} title="Gouttes d’encre">
        <span className="pk-drop" aria-hidden="true" />
        <Compteur valeur={gouttes} />
      </li>
      <li aria-label={pluriel(sabliers, 'sablier')} title="Sabliers">
        <Sablier />
        <Compteur valeur={sabliers} />
      </li>
    </ul>
  )
}

/**
 * Navigation principale (design système 4.1) : cinq destinations, dans cet
 * ordre. Barre d'onglets en bas sur mobile, rail vertical au-delà de 1 100 px.
 */
export function Navigation({ onglets = ONGLETS, actif, compteurs, onChoisir, ressources }: Props) {
  const [ouvert, setOuvert] = useState(false)
  const idPanneau = useId()
  const racine = useRef<HTMLElement>(null)
  const burger = useRef<HTMLButtonElement>(null)
  const cachees = onglets.length > MAX_MOBILE ? onglets.slice(MAX_MOBILE - 1) : []
  const enBurger = new Set(cachees.map((o) => o.id))
  const nCaches = cachees.reduce((somme, o) => somme + (compteurs[o.id] ?? 0), 0)

  useEffect(() => {
    if (!ouvert) return
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOuvert(false)
      burger.current?.focus()
    }
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false)
    }
    document.addEventListener('keydown', touche)
    document.addEventListener('pointerdown', dehors)
    return () => {
      document.removeEventListener('keydown', touche)
      document.removeEventListener('pointerdown', dehors)
    }
  }, [ouvert])

  const nouveautes = (n: number) =>
    n > 0 && (
      <span className="count" aria-label={`${n} nouveauté${n > 1 ? 's' : ''}`}>
        {n}
      </span>
    )

  return (
    <nav ref={racine} className="navigation" aria-label="Navigation principale">
      <span className="seal navigation-sceau" aria-hidden="true">
        ÉL
      </span>
      {onglets.map(({ id, libelle, icone }) => {
        const n = compteurs[id] ?? 0
        const bouton = (
          <button
            key={id}
            type="button"
            className={[id === actif && 'on', enBurger.has(id) && 'en-burger'].filter(Boolean).join(' ') || undefined}
            data-onglet={id}
            aria-current={id === actif ? 'page' : undefined}
            onClick={() => onChoisir(id)}
          >
            <Icone nom={icone} />
            {libelle}
            {nouveautes(n)}
          </button>
        )
        // Les ressources se lisent juste au-dessus des réglages.
        return id === 'reglages' && ressources ? [<Ressources key="ressources" {...ressources} />, bouton] : bouton
      })}
      {cachees.length > 0 && (
        <>
          <button
            ref={burger}
            type="button"
            className={['navigation-burger', cachees.some((o) => o.id === actif) && 'on'].filter(Boolean).join(' ')}
            aria-expanded={ouvert}
            aria-controls={idPanneau}
            onClick={() => setOuvert(!ouvert)}
          >
            <Icone nom="menu" />
            Menu
            {nouveautes(nCaches)}
          </button>
          <div id={idPanneau} className="navigation-panneau" hidden={!ouvert}>
            {cachees.map(({ id, libelle, icone }) => (
              <button
                key={id}
                type="button"
                aria-current={id === actif ? 'page' : undefined}
                onClick={() => {
                  setOuvert(false)
                  burger.current?.focus()
                  onChoisir(id)
                }}
              >
                <Icone nom={icone} />
                {libelle}
                {nouveautes(compteurs[id] ?? 0)}
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  )
}

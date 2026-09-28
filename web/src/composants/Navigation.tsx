import type { Onglet } from '../services/route'
import { Anneau } from './Anneau'
import { Compteur } from './Compteur'
import { Icone, type NomIcone } from './Icone'
import { Sablier } from './Sabliers'

export type { Onglet }

const ONGLETS: { id: Onglet; libelle: string; icone: NomIcone }[] = [
  { id: 'table', libelle: 'Table', icone: 'table' },
  { id: 'plis', libelle: 'Plis', icone: 'pli' },
  { id: 'codex', libelle: 'Codex', icone: 'codex' },
  { id: 'boutique', libelle: 'Boutique', icone: 'boutique' },
  { id: 'reglages', libelle: 'Réglages', icone: 'reglages' },
]

interface Props {
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
export function Navigation({ actif, compteurs, onChoisir, ressources }: Props) {
  return (
    <nav className="navigation" aria-label="Navigation principale">
      <span className="seal navigation-sceau" aria-hidden="true">
        ÉL
      </span>
      {ONGLETS.map(({ id, libelle, icone }) => {
        const n = compteurs[id] ?? 0
        const bouton = (
          <button
            key={id}
            type="button"
            className={id === actif ? 'on' : undefined}
            data-onglet={id}
            aria-current={id === actif ? 'page' : undefined}
            onClick={() => onChoisir(id)}
          >
            <Icone nom={icone} />
            {libelle}
            {n > 0 && (
              <span className="count" aria-label={`${n} nouveauté${n > 1 ? 's' : ''}`}>
                {n}
              </span>
            )}
          </button>
        )
        // Les ressources se lisent juste au-dessus des réglages.
        return id === 'reglages' && ressources ? [<Ressources key="ressources" {...ressources} />, bouton] : bouton
      })}
    </nav>
  )
}

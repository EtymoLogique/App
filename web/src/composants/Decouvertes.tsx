import type { Decouverte } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import type { CatalogueJeu } from '../services/jeu'
import { Mini } from './Codex'

interface Props {
  decouvertes: Decouverte[]
  entrees: EntreeCodex[]
  jeu: CatalogueJeu
  nouvelles: Set<string>
  onOuvrir: (motId: string) => void
}

/** Découvertes récentes, sous la table sur ordinateur (maquette I-09) : les cinq dernières cartes. */
export function DecouvertesRecentes({ decouvertes, entrees, jeu, nouvelles, onOuvrir }: Props) {
  const recentes = [...decouvertes]
    .sort((a, b) => b.numero - a.numero)
    .slice(0, 5)
    .flatMap((d) => entrees.filter((e) => e.id === d.mot_id))
  if (recentes.length === 0) return null
  return (
    <div className="recentes">
      <hr className="filet" />
      <p className="panel-k">Découvertes récentes</p>
      <div className="recentes-grille">
        {recentes.map((e) => (
          <Mini key={e.id} entree={e} nouvelle={nouvelles.has(e.id)} langue={e.langueId ? (jeu.langues.get(e.langueId) ?? null) : null} onOuvrir={() => onOuvrir(e.id)} />
        ))}
      </div>
    </div>
  )
}

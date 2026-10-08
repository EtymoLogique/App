import type { Rarete } from '../contrat'

// pathLength : le contour peut se tracer (plis.css, forme légendaire de la révélation).
const FORMES: Record<Rarete, { libelle: string; forme: string; trace: React.ReactNode }> = {
  commune: { libelle: 'commune', forme: 'triangle', trace: <path d="M8 1.8 14.8 14H1.2Z" pathLength={100} /> },
  peu_commune: { libelle: 'peu commune', forme: 'carré', trace: <rect x="2.3" y="2.3" width="11.4" height="11.4" rx="0.6" pathLength={100} /> },
  rare: { libelle: 'rare', forme: 'pentagone', trace: <path d="M8 1.3 14.8 6.3 12.2 14.4H3.8L1.2 6.3Z" pathLength={100} /> },
  legendaire: { libelle: 'légendaire', forme: 'diamant', trace: <path d="M8 .6 13.6 8 8 15.4 2.4 8Z" pathLength={100} /> },
}

/**
 * Forme de rareté (identité : triangle, carré, pentagone, diamant), remplie
 * d'Ambre et cernée d'Encre, avec un nom accessible. Jamais posée sur une brique.
 */
export function FormeRarete({ rarete, className = 'rar' }: { rarete: Rarete; className?: string }) {
  const { libelle, forme, trace } = FORMES[rarete]
  return (
    <svg className={className} viewBox="0 0 16 16" role="img" aria-label={`Rareté : ${libelle}`}>
      <title>{`${libelle} · ${forme}`}</title>
      {trace}
    </svg>
  )
}

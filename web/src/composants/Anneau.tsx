import { useId } from 'react'

const CIRCONFERENCE = 150.8

/**
 * Jauge de recharge d'un pli, de 0 à 1. Quand des sabliers l'avancent
 * (`avance`), un halo flou pulse sous le trait et une tête lumineuse en
 * marque le bout.
 */
export function Anneau({ progression: brute, avance = false, className }: { progression: number; avance?: boolean; className?: string }) {
  const flou = useId()
  // Hors de [0, 1] (prochaine charge au-delà d'une recharge), le motif de pointillés se répète et l'anneau clignote.
  const progression = Math.min(1, Math.max(0, brute))
  const trait = { strokeDasharray: CIRCONFERENCE, strokeDashoffset: CIRCONFERENCE * (1 - progression) }
  // L'anneau est tourné de −90° : l'angle part de la droite, comme le trait.
  const angle = progression * 2 * Math.PI
  return (
    <svg viewBox="0 0 60 60" className={[className, avance ? 'is-avance' : ''].filter(Boolean).join(' ') || undefined} aria-hidden="true">
      <defs>
        <filter id={flou} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <circle className="ring-track" cx="30" cy="30" r="24" />
      <circle className="ring-halo" cx="30" cy="30" r="24" style={trait} filter={`url(#${flou})`} />
      <circle className="ring-fill" cx="30" cy="30" r="24" style={trait} />
      <circle className="ring-tete-halo" cx={30 + 24 * Math.cos(angle)} cy={30 + 24 * Math.sin(angle)} r="7" filter={`url(#${flou})`} />
      <circle className="ring-tete" cx={30 + 24 * Math.cos(angle)} cy={30 + 24 * Math.sin(angle)} r="3.5" />
    </svg>
  )
}

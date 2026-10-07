import type { EntreeCodex } from '../services/codex'

type Maitrise = NonNullable<EntreeCodex['maitrise']>

/**
 * Signe de maîtrise (identité, formes) : un galet aplati et son rebond.
 * Ni polygone, ni cercle, ni trois traits : il ne se confond avec aucun autre signe.
 */
export function Galet({ className = 'galet', cache = false }: { className?: string; cache?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...(cache ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Maîtrisée' })}>
      <ellipse cx="12" cy="10" rx="9" ry="5" fill="currentColor" />
      <path d="M4 17.5q8 4 16 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** Filet de maîtrise : quatre segments, un par niveau, le dernier pour la maîtrise. Jamais trois traits (confiance). */
export function Filet({ maitrise, className = 'filet-maitrise' }: { maitrise: Maitrise; className?: string }) {
  const crans = maitrise.maitrisee ? 4 : maitrise.niveau
  return (
    <span className={className} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i < crans ? 'on' : undefined} />
      ))}
    </span>
  )
}

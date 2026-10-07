import type { CSSProperties } from 'react'

import type { TypeCarte } from '../services/codex'

/** Bandeau : couleur du type de ressource ; Encre pour un mot (identité, « une couleur, un seul sens »). */
export function bandeau(type: TypeCarte): CSSProperties {
  // Bandeau, texte, et teinte de la forme de rareté posée dessus : plus foncée
  // qu'un bandeau clair, plus claire que le bandeau Encre d'un mot (ADR 0040).
  const couleurs: Record<TypeCarte, [string, string, string]> = {
    mot: ['var(--fixed-ink)', '#f3eee3', 'color-mix(in srgb, var(--fixed-ink), #f3eee3 38%)'],
    prefixe: ['var(--c-prefix)', 'var(--fixed-ink)', 'var(--c-prefix-deep)'],
    suffixe: ['var(--c-suffix)', 'var(--fixed-ink)', 'var(--c-suffix-deep)'],
    langue: ['var(--c-lang)', 'var(--fixed-ink)', 'var(--c-lang-deep)'],
  }
  const [tc, tt, rd] = couleurs[type]
  return { '--tc': tc, '--tt': tt, '--rd': rd } as CSSProperties
}

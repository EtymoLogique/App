/**
 * Découper : les jointures d'un mot de `n` lettres sont numérotées de 1 (entre la 1re et la 2e lettre) à `n - 1`.
 * Ces fonctions ne connaissent ni le DOM ni la souris : la mise en page fournit `positions`, l'abscisse de chaque jointure.
 */

/** Jointures où aucune coupe n'est encore posée. */
export function jointuresLibres(n: number, coupes: readonly number[]): number[] {
  return Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1).filter((j) => !coupes.includes(j))
}

/** La jointure libre la plus proche de l'abscisse `x` ; `null` quand toutes sont coupées. */
export function jointureLaPlusProche(positions: readonly number[], x: number, coupes: readonly number[]): number | null {
  let meilleure: number | null = null
  let ecart = Infinity
  for (const j of jointuresLibres(positions.length, coupes)) {
    const d = Math.abs((positions[j] ?? Infinity) - x)
    if (d < ecart) {
      ecart = d
      meilleure = j
    }
  }
  return meilleure
}

/** La jointure libre qui suit (`sens` = 1) ou précède (`sens` = -1) `depuis`, en sautant les coupes ; `depuis` si aucune. */
export function jointureVoisine(depuis: number, sens: 1 | -1, n: number, coupes: readonly number[]): number {
  for (let j = depuis + sens; j >= 1 && j < n; j += sens) if (!coupes.includes(j)) return j
  return depuis
}

/**
 * Où la lame attend le joueur : une jointure libre tirée au hasard parmi celles qui ne sont pas une coupe attendue, pour
 * qu'il ait toujours à la déplacer. Faute de mieux (toutes les libres sont attendues), n'importe quelle libre.
 */
export function jointureInitiale(n: number, coupes: readonly number[], attendu: readonly number[], hasard: () => number = Math.random): number | null {
  const libres = jointuresLibres(n, coupes)
  const leurres = libres.filter((j) => !attendu.includes(j))
  const tirage = leurres.length > 0 ? leurres : libres
  if (tirage.length === 0) return null
  return tirage[Math.min(tirage.length - 1, Math.floor(hasard() * tirage.length))] ?? null
}

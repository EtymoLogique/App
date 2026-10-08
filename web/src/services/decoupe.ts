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

/** La jointure libre la plus proche de `depuis`, d'un côté ou de l'autre ; `null` quand toutes sont coupées. */
export function jointureLibreProche(depuis: number, n: number, coupes: readonly number[]): number | null {
  const libres = jointuresLibres(n, coupes)
  return libres.reduce<number | null>((m, j) => (m === null || Math.abs(j - depuis) < Math.abs(m - depuis) ? j : m), null)
}

/** Où la lame attend le joueur à l'arrivée : vers 40 % du mot, sur une jointure libre. */
export function jointureInitiale(n: number, coupes: readonly number[]): number | null {
  return jointureLibreProche(Math.max(1, Math.round(n * 0.4)), n, coupes)
}

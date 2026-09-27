// Recherche partagée par la réserve de la table et le codex (maquette I-17) :
// par forme ou par sens, sans accents ni casse.

/** Sans accents ni casse, pour chercher « geo » comme « géo- ». */
export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** Vrai si l'un des textes contient la recherche ; une recherche vide trouve tout. */
export function correspond(requete: string, ...textes: (string | null | undefined)[]): boolean {
  const cherchee = normaliser(requete.trim())
  return cherchee === '' || textes.some((t) => t && normaliser(t).includes(cherchee))
}

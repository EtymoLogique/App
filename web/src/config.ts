// Adresses fixées à la compilation, par environnement (ADR 0028).

function requise(nom: string, valeur: string | undefined): string {
  if (!valeur) throw new Error(`Variable de compilation manquante : ${nom}`)
  return valeur.replace(/\/+$/, '')
}

export const config = {
  /** API de jeu (Serverless Containers). */
  urlApi: requise('VITE_URL_API', import.meta.env.VITE_URL_API),
  /** Préfixe public du catalogue : `…/public`, lu sans clé (ADR 0027, ADR 0029). */
  urlCatalogue: requise('VITE_URL_CATALOGUE', import.meta.env.VITE_URL_CATALOGUE),
}

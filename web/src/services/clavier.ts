// Clavier virtuel : les modales se posent sur la partie visible de l'écran.
//
// Sur iOS (et sur Chrome Android, par défaut), le clavier ne réduit pas la fenêtre de mise en page :
// il recouvre seulement la zone visible (`visualViewport`). Une modale `position: fixed; inset: 0`
// garde donc toute la hauteur de l'écran, et une feuille posée en bas passe sous le clavier.
// On publie la zone visible en variables CSS (`--vue-haut`, `--vue-hauteur`) ; `.scrim` s'y cale
// (styles.css), et le champ actif est ramené dans la zone visible.

const RACINE_HAUT = '--vue-haut'
const RACINE_HAUTEUR = '--vue-hauteur'

/** Le clavier occupe au moins cette hauteur : en deçà, c'est la barre d'adresse qui bouge. */
const SEUIL_CLAVIER_PX = 120

/** Champ de saisie qui ouvre le clavier virtuel. */
export function ouvreLeClavier(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement || el.isContentEditable) return true
  if (!(el instanceof HTMLInputElement)) return false
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(el.type)
}

/**
 * Zone visible à publier, ou `null` quand elle couvre toute la fenêtre (pas de clavier) :
 * les modales gardent alors `inset: 0`. Un zoom à deux doigts ne compte pas comme un clavier.
 */
export function zoneVisible(
  vue: Pick<VisualViewport, 'height' | 'offsetTop' | 'scale'>,
  hauteurFenetre: number,
): { haut: number; hauteur: number } | null {
  if (Math.abs(vue.scale - 1) > 0.01) return null
  if (hauteurFenetre - vue.height < SEUIL_CLAVIER_PX) return null
  return { haut: Math.max(0, vue.offsetTop), hauteur: vue.height }
}

/** À appeler une fois au démarrage. Renvoie la fonction qui débranche les écouteurs. */
export function suivreLeClavier(fenetre: Window = window): () => void {
  const vue = fenetre.visualViewport
  if (!vue) return () => {}
  const racine = fenetre.document.documentElement
  let image = 0
  const appliquer = () => {
    image = 0
    const zone = zoneVisible(vue, fenetre.innerHeight)
    racine.toggleAttribute('data-clavier', zone !== null)
    if (!zone) {
      racine.style.removeProperty(RACINE_HAUT)
      racine.style.removeProperty(RACINE_HAUTEUR)
      return
    }
    racine.style.setProperty(RACINE_HAUT, `${zone.haut}px`)
    racine.style.setProperty(RACINE_HAUTEUR, `${zone.hauteur}px`)
    // Dans une modale, le champ actif reste au-dessus du clavier (la boîte défile si besoin).
    const actif = fenetre.document.activeElement
    if (ouvreLeClavier(actif) && actif.closest('.scrim')) actif.scrollIntoView({ block: 'nearest' })
  }
  const planifier = () => {
    if (!image) image = fenetre.requestAnimationFrame(appliquer)
  }
  vue.addEventListener('resize', planifier)
  vue.addEventListener('scroll', planifier)
  appliquer()
  return () => {
    vue.removeEventListener('resize', planifier)
    vue.removeEventListener('scroll', planifier)
    if (image) fenetre.cancelAnimationFrame(image)
  }
}

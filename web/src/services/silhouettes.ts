// Silhouettes des cartes (ADR 0023) : insérées dans la page pour prendre la
// teinte de la carte (currentColor) et le fond de ses évidements (var(--art-bg)).
// Le fichier est vérifié par son empreinte, et Content l'a passé au profil SVG ;
// on reconstruit quand même l'arbre ici, élément par élément, depuis la même
// liste blanche : aucun script, lien, texte ni gestionnaire ne peut passer.

const SVG_NS = 'http://www.w3.org/2000/svg'

const ELEMENTS = new Set(['svg', 'g', 'defs', 'clipPath', 'mask', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])
const ATTRIBUTS = new Set([
  'viewBox', 'preserveAspectRatio', 'width', 'height', 'id',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform',
  'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity', 'opacity',
  'clip-path', 'clip-rule', 'clipPathUnits', 'mask', 'maskUnits', 'maskContentUnits', 'style',
])
const PROPRIETES_STYLE = new Set(['fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity'])
const INTERDITS = ['javascript:', 'data:', 'expression(', '@import', '\\', '<', '&']

function valeurSure(valeur: string): boolean {
  const bas = valeur.toLowerCase()
  if (INTERDITS.some((m) => bas.includes(m))) return false
  // Seules les références locales url(#…) sont admises.
  const urls = valeur.match(/url\(/g)?.length ?? 0
  const locales = valeur.match(/url\(#[A-Za-z][\w-]*\)/g)?.length ?? 0
  return urls === locales
}

function styleSur(style: string): string | null {
  const declarations: string[] = []
  for (const brute of style.split(';')) {
    const [nom, ...reste] = brute.split(':')
    const propriete = nom?.trim()
    const valeur = reste.join(':').trim()
    if (!propriete || !valeur) continue
    if (!PROPRIETES_STYLE.has(propriete) || !valeurSure(valeur)) return null
    declarations.push(`${propriete}:${valeur}`)
  }
  return declarations.join(';')
}

function copier(source: Element): SVGElement | null {
  if (source.namespaceURI !== SVG_NS || !ELEMENTS.has(source.localName)) return null
  const cible = document.createElementNS(SVG_NS, source.localName)
  for (const attribut of Array.from(source.attributes)) {
    if (attribut.namespaceURI || !ATTRIBUTS.has(attribut.name)) continue
    const valeur = attribut.name === 'style' ? styleSur(attribut.value) : valeurSure(attribut.value) ? attribut.value : null
    if (valeur !== null) cible.setAttribute(attribut.name, valeur)
  }
  for (const enfant of Array.from(source.children)) {
    const copie = copier(enfant)
    if (copie) cible.appendChild(copie)
  }
  return cible
}

/** Reconstruit un SVG sûr à partir de son texte, ou `null` s'il sort du profil. */
export function svgSur(texte: string): SVGSVGElement | null {
  const document_ = new DOMParser().parseFromString(texte, 'image/svg+xml')
  const racine = document_.documentElement
  if (racine.getElementsByTagName('parsererror').length > 0 || racine.localName !== 'svg') return null
  const copie = copier(racine)
  if (!copie) return null
  copie.setAttribute('aria-hidden', 'true')
  copie.setAttribute('focusable', 'false')
  return copie as SVGSVGElement
}

const cache = new Map<string, Promise<SVGSVGElement | null>>()

/** Charge une silhouette une seule fois ; chaque carte en reçoit une copie. */
export async function chargerSilhouette(url: string, lire: (url: string) => Promise<string>): Promise<SVGSVGElement | null> {
  let promesse = cache.get(url)
  if (!promesse) {
    promesse = lire(url).then(svgSur, () => null)
    cache.set(url, promesse)
  }
  const svg = await promesse
  return svg ? (svg.cloneNode(true) as SVGSVGElement) : null
}

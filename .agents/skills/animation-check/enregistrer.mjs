#!/usr/bin/env node
// Enregistre une page pendant une action, puis découpe la vidéo en images avec ffmpeg
// pour observer l'animation au ralenti. Usage : voir SKILL.md ou `--aide`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const { values: o } = parseArgs({
  options: {
    url: { type: 'string' },
    attendre: { type: 'string' },
    clic: { type: 'string' },
    survol: { type: 'string' },
    touche: { type: 'string' },
    script: { type: 'string' },
    zone: { type: 'string' },
    duree: { type: 'string', default: '1500' },
    ralenti: { type: 'string', default: '1' },
    fps: { type: 'string', default: '25' },
    largeur: { type: 'string', default: '390' },
    hauteur: { type: 'string', default: '844' },
    reduit: { type: 'boolean', default: false },
    sombre: { type: 'boolean', default: false },
    colonnes: { type: 'string', default: '6' },
    planche: { type: 'string', default: '36' },
    sortie: { type: 'string' },
    aide: { type: 'boolean', default: false },
  },
})

if (o.aide || !o.url || !(o.clic || o.survol || o.touche || o.script)) {
  console.log(`Usage : node enregistrer.mjs --url <url> (--clic <sél> | --survol <sél> | --touche <touche> | --script <fichier.mjs>) [options]

  --attendre <sél>   attendre qu'un élément soit visible avant l'action
  --script <f.mjs>   module exportant \`preparer({ page })\` (optionnel) et \`action({ page })\`
  --zone <sél>       recadrer les images sur cet élément (marge de 24 px)
  --duree <ms>       durée observée après le début de l'action, en temps d'animation (1500)
  --ralenti <n>      ralentit les animations CSS/WAAPI d'un facteur n via CDP (1)
  --fps <n>          images extraites par seconde de vidéo (25, maximum utile 25)
  --largeur/--hauteur  fenêtre (390 × 844)
  --reduit           prefers-reduced-motion: reduce
  --sombre           prefers-color-scheme: dark
  --colonnes <n>     colonnes de la planche contact (6)
  --planche <n>      nombre maximal de vignettes sur la planche, une image sur k au-delà (36)
  --sortie <dossier> dossier de sortie (/tmp/animation-check/<horodatage>)`)
  process.exit(o.aide ? 0 : 1)
}

const ralenti = Number(o.ralenti)
const fps = Number(o.fps)
const duree = Number(o.duree)
const largeur = Number(o.largeur)
const hauteur = Number(o.hauteur)
for (const [nom, v] of Object.entries({ ralenti, fps, duree, largeur, hauteur })) {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`--${nom} doit être un nombre positif`)
}

const sortie = path.resolve(o.sortie ?? `/tmp/animation-check/${new Date().toISOString().replace(/[:.]/g, '-')}`)
const dossierImages = path.join(sortie, 'images')
mkdirSync(dossierImages, { recursive: true })

const scenario = o.script ? await import(pathToFileURL(path.resolve(o.script)).href) : {}

const navigateur = await chromium.launch()
const contexte = await navigateur.newContext({
  viewport: { width: largeur, height: hauteur },
  deviceScaleFactor: 1,
  reducedMotion: o.reduit ? 'reduce' : 'no-preference',
  colorScheme: o.sombre ? 'dark' : 'light',
  recordVideo: { dir: sortie, size: { width: largeur, height: hauteur } },
})
const page = await contexte.newPage()
const t0 = performance.now()
const erreurs = []
page.on('pageerror', (e) => erreurs.push(String(e)))
page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()))

await page.goto(o.url, { waitUntil: 'networkidle' })
if (o.attendre) await page.locator(o.attendre).first().waitFor({ state: 'visible' })
if (scenario.preparer) await scenario.preparer({ page })
// Sinon Playwright fait défiler la page au moment du clic, et le défilement masque l'animation.
const cible = o.clic ?? o.survol
if (cible) await page.locator(cible).first().evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
// Laisse retomber les animations d'arrivée pour que la première image soit l'état de repos.
await page.waitForTimeout(400)

let zone = null
if (o.zone) {
  const b = await page.locator(o.zone).first().boundingBox()
  if (!b) throw new Error(`--zone : « ${o.zone} » introuvable ou invisible`)
  const x = Math.max(0, Math.floor(b.x - 24))
  const y = Math.max(0, Math.floor(b.y - 24))
  zone = {
    x, y,
    w: Math.min(largeur - x, Math.ceil(b.width + 48)) & ~1,
    h: Math.min(hauteur - y, Math.ceil(b.height + 48)) & ~1,
  }
}

const cdp = await contexte.newCDPSession(page)
await cdp.send('Animation.enable')
await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / ralenti })

const debutAction = (performance.now() - t0) / 1000
if (o.clic) await page.locator(o.clic).first().click()
else if (o.survol) await page.locator(o.survol).first().hover()
else if (o.touche) await page.keyboard.press(o.touche)
else await scenario.action({ page })
await page.waitForTimeout(duree * ralenti)

const video = page.video()
await contexte.close()
await navigateur.close()
const fichierVideo = path.join(sortie, 'video.webm')
renameSync(await video.path(), fichierVideo)

// Marge de 0,3 s avant l'action : le départ de la vidéo n'est connu qu'à ~100 ms près.
const debut = Math.max(0, debutAction - 0.3)
const longueur = 0.3 + (duree * ralenti) / 1000
const police = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(existsSync)
const filtres = [`fps=${fps}`]
if (zone) filtres.push(`crop=${zone.w}:${zone.h}:${zone.x}:${zone.y}`)
const filtresEtiquette = police
  ? [...filtres, `drawtext=fontfile=${police}:text='%{eif\\:(t-0.3)*1000/${ralenti}\\:d} ms':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=4`]
  : filtres

const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
ffmpeg(['-ss', String(debut), '-t', String(longueur), '-i', fichierVideo, '-vf', filtres.join(','), path.join(dossierImages, 'image_%04d.png')])
ffmpeg(['-ss', String(debut), '-t', String(longueur), '-i', fichierVideo, '-vf', filtresEtiquette.join(','), path.join(sortie, 'ralenti.mp4')])

const pas = 1000 / fps / ralenti
const images = readdirSync(dossierImages).filter((f) => f.endsWith('.png')).sort()
const colonnes = Number(o.colonnes)
const saut = Math.max(1, Math.ceil(images.length / Number(o.planche)))
const lignes = Math.ceil(Math.ceil(images.length / saut) / colonnes)
const vignette = zone ? Math.min(zone.w, 320) : 240
ffmpeg([
  '-i', path.join(sortie, 'ralenti.mp4'),
  '-vf', `select='not(mod(n\\,${saut}))',scale=${vignette}:-2,tile=${colonnes}x${lignes}:padding=4:margin=4:color=0x2A2A2A`,
  '-frames:v', '1', path.join(sortie, 'planche.png'),
])

const mesures = {
  url: o.url, ralenti, fps, dureeMs: duree, zone,
  images: images.length,
  plancheUneImageSur: saut,
  msParImage: Number(pas.toFixed(2)),
  premiereImageMs: -300 / ralenti,
  erreursConsole: erreurs,
}
writeFileSync(path.join(sortie, 'mesures.json'), JSON.stringify(mesures, null, 2))

console.log(`Sortie : ${sortie}
  planche.png   planche contact (1 image sur ${saut}, soit ${(pas * saut).toFixed(1)} ms entre vignettes, horodatées en temps d'animation)
  images/       image_0001.png… une image = ${pas.toFixed(1)} ms d'animation ; l'action commence vers l'image ${Math.round((0.3 * fps)) + 1}
  ralenti.mp4   vidéo recadrée et horodatée
  video.webm    enregistrement brut
  mesures.json  paramètres${erreurs.length ? `\n⚠ ${erreurs.length} erreur(s) console, voir mesures.json` : ''}`)

/// <reference types="vitest/config" />
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const HACHE = /^\/(?:[fr]\/[0-9a-f]{64}\.json|a\/[0-9a-f]{64}\.svg)$/

function origine(url: string | undefined): string {
  if (!url) throw new Error('VITE_URL_API et VITE_URL_CATALOGUE sont requises pour compiler la PWA.')
  return new URL(url).origin
}

/**
 * CSP stricte, sans script tiers (ADR 0024). Posée en `<meta>` tant que le CDN
 * n'ajoute pas d'en-têtes ; `frame-ancestors` exigera l'en-tête HTTP (jalon 8).
 */
function csp(env: Record<string, string | undefined>): Plugin {
  const api = origine(env.VITE_URL_API)
  const catalogue = origine(env.VITE_URL_CATALOGUE)
  const politique = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // Attributs `style` des silhouettes SVG du catalogue (svgSur les filtre) ; les feuilles restent en 'self'.
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' ${catalogue}`,
    `connect-src 'self' ${api} ${catalogue}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ')
  return {
    name: 'etymo-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${politique}" />`),
  }
}

/**
 * Référencement. Seule la coque `/` peut s'indexer : les écrans vivent dans le
 * fragment (ADR 0034) et l'adresse ne porte jamais de texte du catalogue.
 * `ETYMO_URL_PWA` (posée par Infra) donne les adresses absolues ; seule la prod
 * pose `ETYMO_INDEXABLE=oui`. Ailleurs, `noindex`, et robots.txt laisse passer
 * les robots pour qu'ils lisent cette consigne.
 */
function referencement(env: Record<string, string | undefined>): Plugin {
  const site = env.ETYMO_URL_PWA ? new URL(env.ETYMO_URL_PWA).origin : null
  const indexable = site !== null && env.ETYMO_INDEXABLE === 'oui'
  return {
    name: 'etymo-referencement',
    apply: 'build',
    transformIndexHtml(html) {
      const description = /name="description" content="([^"]+)"/.exec(html)?.[1]
      const jeu = {
        '@type': ['VideoGame', 'WebApplication'],
        name: 'ÉtymoLogique',
        description,
        inLanguage: 'fr',
        genre: ['Jeu de logique', 'Jeu de mots', 'Jeu de collection'],
        about: { '@type': 'Thing', name: 'Étymologie', sameAs: 'https://www.wikidata.org/wiki/Q35245' },
        isBasedOn: { '@type': 'Dataset', name: 'Wikidata', url: 'https://www.wikidata.org/' },
        applicationCategory: 'GameApplication',
        gamePlatform: 'Navigateur web',
        operatingSystem: 'Tout système doté d’un navigateur récent',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR' },
        author: { '@type': 'Person', name: 'Guillaume MARTINEZ' },
        license: 'https://www.gnu.org/licenses/agpl-3.0.html',
        ...(site && { url: `${site}/`, image: `${site}/partage.png` }),
      }
      const donnees = JSON.stringify({ '@context': 'https://schema.org', ...jeu })
      const balises = [
        `<meta name="robots" content="${indexable ? 'index, follow, max-image-preview:large' : 'noindex'}" />`,
        ...(site
          ? [
              `<link rel="canonical" href="${site}/" />`,
              `<meta property="og:url" content="${site}/" />`,
              `<meta property="og:image" content="${site}/partage.png" />`,
            ]
          : []),
        `<script type="application/ld+json">${donnees.replaceAll('<', '\\u003c')}</script>`,
      ]
      return html.replace('</head>', `  ${balises.join('\n    ')}\n  </head>`)
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', ...(indexable ? ['', `Sitemap: ${site}/sitemap.xml`] : [])]
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots.join('\n')}\n` })
      if (!indexable) return
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc></url>\n</urlset>\n`,
      })
    },
  }
}

/**
 * Développement : sert sous `/catalogue/` le préfixe `public/` d'un bucket
 * simulé sur disque (`ETYMO_BUCKET_LOCAL`), comme le ferait le CDN.
 */
function catalogueLocal(dossier: string | undefined): Plugin {
  return {
    name: 'etymo-catalogue-local',
    apply: 'serve',
    configureServer(serveur) {
      if (!dossier) return
      const racine = path.resolve(dossier, 'public')
      serveur.middlewares.use('/catalogue', (requete, reponse) => {
        const chemin = (requete.url ?? '').split('?')[0] ?? ''
        const fichier = path.join(racine, chemin)
        if ((chemin !== '/index.json' && !HACHE.test(chemin)) || !existsSync(fichier) || !statSync(fichier).isFile()) {
          reponse.statusCode = 403
          reponse.end()
          return
        }
        reponse.setHeader('Content-Type', chemin.endsWith('.svg') ? 'image/svg+xml' : 'application/json')
        reponse.setHeader('Cache-Control', chemin === '/index.json' ? 'no-cache' : 'public, max-age=31536000, immutable')
        createReadStream(fichier).pipe(reponse)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      catalogueLocal(env.ETYMO_BUCKET_LOCAL),
      ...(mode === 'test' ? [] : [csp(env), referencement(env)]),
      VitePWA({
        // Enregistré par `MiseAJour` : une nouvelle version attend l'accord du joueur.
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          name: 'ÉtymoLogique',
          short_name: 'ÉtymoLogique',
          description: 'Assemblez des briques linguistiques pour retrouver les mots et leur histoire.',
          lang: 'fr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#f3eee3',
          theme_color: '#ff6b4a',
          categories: ['games', 'education'],
          icons: [
            { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icone-masquable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // La coque seulement : aucun lot du catalogue n'est précaché (ADR 0025).
          globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
          navigateFallback: '/index.html',
          // Fichiers des robots : le service worker ne les remplace jamais par la coque.
          navigateFallbackDenylist: [/^\/(?:robots\.txt|sitemap\.xml|llms\.txt|mentions-legales\.html|donnees-personnelles\.html)$/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // Fichiers hachés : immuables, gardés sans limite une fois lus.
              urlPattern: ({ url }) => /\/(?:[fr]\/[0-9a-f]{64}\.json|a\/[0-9a-f]{64}\.svg)$/.test(url.pathname),
              handler: 'CacheFirst',
              options: { cacheName: 'catalogue-hache', cacheableResponse: { statuses: [200] } },
            },
            {
              // Index global : revalidé à chaque lancement, dernière version lue hors connexion.
              urlPattern: ({ url }) => url.pathname.endsWith('/index.json'),
              handler: 'NetworkFirst',
              options: { cacheName: 'catalogue-index', networkTimeoutSeconds: 5, cacheableResponse: { statuses: [200] } },
            },
          ],
        },
      }),
    ],
    build: { sourcemap: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      env: { VITE_URL_API: 'https://api.exemple.test', VITE_URL_CATALOGUE: 'https://catalogue.exemple.test/public' },
    },
  }
})

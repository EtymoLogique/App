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
      ...(mode === 'test' ? [] : [csp(env)]),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script-defer',
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
          icons: [{ src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        },
        workbox: {
          // La coque seulement : aucun lot du catalogue n'est précaché (ADR 0025).
          globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
          navigateFallback: '/index.html',
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

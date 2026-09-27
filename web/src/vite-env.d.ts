/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_URL_API: string
  readonly VITE_URL_CATALOGUE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

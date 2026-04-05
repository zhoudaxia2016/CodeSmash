/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin only (no /api), e.g. https://codesmash.example.deno.net — for GitHub Pages + separate API */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

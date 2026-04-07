import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/CodeSmash/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['pwa-icon.svg', 'pwa-icon-maskable.svg'],
      manifest: {
        name: 'CodeSmash',
        short_name: 'CodeSmash',
        description: 'CodeSmash 算法对战应用',
        start_url: mode === 'production' ? '/CodeSmash/' : '/',
        scope: mode === 'production' ? '/CodeSmash/' : '/',
        display: 'standalone',
        background_color: '#0b1020',
        theme_color: '#4f46e5',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-icon-maskable.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // Pre-bundle breaks wasm / import.meta.url resolution for the runtime in dev.
    exclude: [
      'web-tree-sitter',
      'quickjs-emscripten',
      '@jitl/quickjs-wasmfile-release-sync',
      '@jitl/quickjs-wasmfile-debug-sync',
      '@jitl/quickjs-wasmfile-release-asyncify',
      '@jitl/quickjs-wasmfile-debug-asyncify',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            const host = req.headers.host
            if (host) {
              proxyReq.setHeader('X-Forwarded-Host', host)
              proxyReq.setHeader('X-Forwarded-Proto', 'http')
            }
          })
        },
      },
    },
  },
}))

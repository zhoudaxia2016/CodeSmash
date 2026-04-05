import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
})

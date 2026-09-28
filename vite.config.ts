import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

import { apiDevServer } from './vite-plugins/api-dev-server.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevServer()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    // Long-lived static caching is safe because Vite fingerprints asset names.
    assetsInlineLimit: 0,
  },
})

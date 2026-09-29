import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

import { apiDevServer } from './vite-plugins/api-dev-server.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevServer()],
  server: {
    // Pinned rather than left to Vite's fallback, so `npm run ui:audit` and
    // anything else hardcoding the port keep working when 5173 is busy.
    port: 5177,
    strictPort: true,
  },
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

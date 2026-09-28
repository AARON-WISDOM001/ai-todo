import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    restoreMocks: true,
    // 5s is the library default and it is too tight for the app-flow suite,
    // which types character by character through userEvent against a real
    // component tree. Under parallel load that produces timeouts that have
    // nothing to do with correctness, and a gate that flakes gets ignored.
    testTimeout: 20_000,
  },
})

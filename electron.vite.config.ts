import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      // music-metadata is ESM-only; bundle it into the CJS main process instead of externalizing it.
      externalizeDeps: { exclude: ['music-metadata'] }
    }
  },
  preload: {},
  renderer: {}
})

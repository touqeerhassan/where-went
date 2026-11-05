import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// Dev server serves the prototype shell at / and the landing pages at
// /src/landing/ and /src/landing/privacy.html. `vite build` emits only the
// prototype; the landing page has its own config (vite.landing.config.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/prototype',
    emptyOutDir: true,
    rollupOptions: { input: resolve(import.meta.dirname, 'index.html') },
  },
})

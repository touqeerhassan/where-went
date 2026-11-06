import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// Design prototype (mock data, screen switcher) and the landing page in dev.
// `npm run dev` serves the prototype at / and the landing page at /src/landing/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __WW_DEV__: 'true' },
  publicDir: false,
  build: {
    outDir: 'dist-prototype',
    emptyOutDir: true,
    rollupOptions: { input: resolve(import.meta.dirname, 'index.html') },
  },
})

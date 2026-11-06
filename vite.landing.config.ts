import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// Standalone static build of the landing page + privacy policy.
// Output: dist/landing (deploy that folder as-is to any static host).
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/landing'),
  envDir: import.meta.dirname,
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist-landing'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'src/landing/index.html'),
        privacy: resolve(import.meta.dirname, 'src/landing/privacy.html'),
      },
    },
  },
  preview: { port: 4174 },
})

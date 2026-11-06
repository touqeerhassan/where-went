import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { buildManifest } from './src/ext/manifest'

const pages = resolve(import.meta.dirname, 'src/ext/pages')
const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

/** Emit manifest.json from src/ext/manifest.ts so the version follows package.json. */
function manifest(dev: boolean): Plugin {
  return {
    name: 'wherewent-manifest',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(buildManifest(pkg.version, dev), null, 2) })
    },
  }
}

// The Chrome extension: `npm run build` -> dist/, loadable via chrome://extensions > Load unpacked.
// Entries: service worker (background.js), popup, dashboard and return-prompt pages.
export default defineConfig(({ mode }) => {
  const dev = mode === 'development'
  return {
    root: pages,
    base: '',
    publicDir: resolve(import.meta.dirname, 'public'),
    envDir: import.meta.dirname,
    plugins: [react(), tailwindcss(), manifest(dev)],
    define: { __WW_DEV__: JSON.stringify(dev) },
    build: {
      outDir: resolve(import.meta.dirname, 'dist'),
      emptyOutDir: true,
      target: 'chrome116',
      // No inline helpers or polyfills that touch `document` in the service worker,
      // and nothing that would need 'unsafe-inline' under the extension CSP.
      modulePreload: { polyfill: false },
      minify: !dev,
      sourcemap: dev,
      rollupOptions: {
        input: {
          popup: resolve(pages, 'popup.html'),
          dashboard: resolve(pages, 'dashboard.html'),
          prompt: resolve(pages, 'prompt.html'),
          background: resolve(import.meta.dirname, 'src/ext/background.ts'),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        },
      },
    },
  }
})

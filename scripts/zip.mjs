// Zip dist/ into wherewent-<version>.zip for teammates (unzip, then Load unpacked).
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { zipSync } from 'fflate'

const root = new URL('..', import.meta.url).pathname
const dist = join(root, 'dist')
if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json not found. Run `npm run build` first.')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
const files = {}
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (!name.endsWith('.map')) files[relative(dist, p).split('\\').join('/')] = readFileSync(p)
  }
}
walk(dist)
const suffix = manifest.name.includes('(dev)') ? '-dev' : ''
const out = join(root, `wherewent-${manifest.version}${suffix}.zip`)
writeFileSync(out, zipSync(files, { level: 9 }))
console.log(`Wrote ${relative(root, out)} (${Object.keys(files).length} files)`)

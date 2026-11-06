/**
 * End-to-end test of the built extension (dist/) in real Chromium with the
 * real chrome.idle API. Linux only: runs under Xvfb, and uses a tiny XTEST
 * helper (e2e/xpoke.c) to produce genuine user input for "I'm back".
 *
 *   npm run build && npm run e2e
 *
 * Covers, for both return modes: start from the popup UI, real idle detection
 * with a 15 s threshold, backdated entry end, return, prompt/notification or
 * auto-resume, resume. Plus: service worker restart mid-session, manual stop
 * while a prompt is pending, CSV export, and "no network requests".
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  console.error('Playwright is not installed. `npm i -D playwright && npx playwright install chromium` first.')
  process.exit(2)
}
if (!process.env.DISPLAY) {
  console.error('No X display. Run via `npm run e2e` (uses xvfb-run).')
  process.exit(2)
}
const xpoke = join(here, 'xpoke')
if (!existsSync(xpoke)) {
  execFileSync('gcc', [join(here, 'xpoke.c'), '-o', xpoke, '/usr/lib/x86_64-linux-gnu/libXtst.so.6', '/usr/lib/x86_64-linux-gnu/libX11.so.6'])
}
const poke = () => execFileSync(xpoke) // real input: the X server's idle timer resets
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) failures++
}

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  acceptDownloads: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
})
const external = []
ctx.on('request', (r) => {
  const u = r.url()
  if (!u.startsWith('chrome-extension://') && !u.startsWith('data:') && !u.startsWith('blob:') && u !== 'about:blank') external.push(u)
})
const errors = []
const watchPage = (p) => {
  p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && errors.push(`${p.url()}: ${m.text()}`))
}
ctx.on('page', watchPage)

let [sw] = ctx.serviceWorkers()
if (!sw) sw = await ctx.waitForEvent('serviceworker')
const id = sw.url().split('/')[2]
const url = (p) => `chrome-extension://${id}/${p}`
const getWorker = async () => ctx.serviceWorkers().find((w) => w.url().includes(id)) ?? (await ctx.waitForEvent('serviceworker'))
const storage = async () => (await getWorker()).evaluate(() => chrome.storage.local.get(null))
const notifications = async () => (await getWorker()).evaluate(() => chrome.notifications.getAll())
const waitFor = async (fn, label, timeout = 45_000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const v = await fn()
    if (v) return v
    await sleep(500)
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
check(!manifest.host_permissions && !manifest.content_scripts, 'manifest has no host permissions or content scripts')
check(JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'idle', 'alarms', 'notifications']), 'manifest permissions are exactly the five needed')

// ---- Onboarding through the real popup UI
const popup = await ctx.newPage()
await popup.goto(url('popup.html'))
await popup.getByRole('button', { name: 'Set up projects' }).click()
await popup.getByRole('textbox', { name: 'Project 1' }).fill('Acme site')
await popup.getByRole('textbox', { name: 'Project 2' }).fill('Ledgerly')
await popup.getByRole('button', { name: /Continue with 2 projects/ }).click()
await popup.getByRole('button', { name: 'Start tracking' }).click()
await popup.getByRole('button', { name: /^Start · / }).waitFor()
check((await storage()).onboarded === true, 'onboarding saved to chrome.storage.local')

// 15 s threshold (the minimum Chrome allows) so idle triggers quickly.
await popup.evaluate(() => chrome.runtime.sendMessage({ ww: { cmd: 'updateSettings', patch: { idleThresholdSec: 15 } } }))

async function startTimer(task) {
  await popup.goto(url('popup.html'))
  await popup.getByLabel('Task').fill(task)
  poke() // the user is at the keyboard
  await popup.getByRole('button', { name: /^Start · / }).click()
  await popup.getByText('Tracking', { exact: true }).waitFor()
  // "Work" for ~10 s (real input every 2 s), then walk away.
  for (let i = 0; i < 5; i++) {
    await sleep(2000)
    poke()
  }
  workedUntil = Date.now()
  return (await storage()).active
}
let workedUntil = 0

// ---- Cycle 1: Ask me
console.log('\n# Ask me')
const a1 = await startTimer('Homepage')
check(a1 && Object.keys(a1).sort().join() === 'projectId,startedAt,taskId', 'active timer stored as {projectId, taskId, startedAt}')
const idle1 = await waitFor(async () => {
  const s = await storage()
  return s.pendingResume && !s.active ? { s, at: Date.now() } : null
}, 'real chrome.idle to stop the timer')
const e1 = idle1.s.entries.at(-1)
check(e1.endedBy === 'idle', 'entry closed by idle')
check(Math.abs(e1.end - idle1.s.pendingResume.idleSince) < 1, 'pendingResume.idleSince equals the entry end')
check(Math.abs(e1.end - workedUntil) < 4000, `entry ends at the last real input, not at detection (off by ${Math.round((e1.end - workedUntil) / 1000)} s)`)
check(idle1.at - e1.end >= 14_000, `backdated by the 15 s threshold (${Math.round((idle1.at - e1.end) / 1000)} s before detection)`)
check(e1.end - e1.start >= 8000, `tracked the ~10 s of work (${Math.round((e1.end - e1.start) / 1000)} s)`)

await sleep(4000)
const promptOpened = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('prompt.html'), timeout: 20_000 })
poke() // back
const prompt = await promptOpened
await prompt.getByRole('heading', { name: /You were away/ }).waitFor()
const s1 = await storage()
check(s1.active == null, 'Ask me never auto-resumes')
check(s1.pendingResume?.returnedAt > 0 && s1.pendingResume.reason === 'ask', 'pendingResume marked as asking')
check(Object.keys(await notifications()).includes('ww-ask'), 'ask notification shown (Resume / Choose another)')
check(s1.away?.length === 1, 'away period recorded, not tracked')
const focused = await prompt.evaluate(() => document.activeElement?.textContent ?? '')
check(/Resume/.test(focused), 'Resume has keyboard focus in the prompt window')
const closed = prompt.waitForEvent('close', { timeout: 10_000 }).then(() => true, () => false)
const tResume = Date.now()
await prompt.keyboard.press('Enter')
const s2 = await waitFor(async () => {
  const s = await storage()
  return s.active ? s : null
}, 'resume to start a new entry')
check(Math.abs(s2.active.startedAt - tResume) < 3000, 'resumed entry starts at the return, not at idle start')
check(s2.active.startedAt - e1.end >= 15_000, `away gap left untracked (${Math.round((s2.active.startedAt - e1.end) / 1000)} s)`)
check(await closed, 'prompt window closed after resuming')
check(!Object.keys(await notifications()).includes('ww-ask'), 'ask notification cleared')

// ---- Service worker restart mid-session
console.log('\n# Service worker restart')
const cdp = await ctx.newCDPSession(popup)
await cdp.send('ServiceWorker.enable').catch(() => {})
await cdp.send('ServiceWorker.stopAllWorkers').catch((e) => console.log('stopAllWorkers:', e.message))
await sleep(1500)
poke()
await popup.goto(url('popup.html')) // wakes the worker via the sync command
await popup.getByText('Tracking', { exact: true }).waitFor()
const s3 = await storage()
check(s3.active?.startedAt === s2.active.startedAt, 'timer survived the worker restart (same startedAt)')

// ---- Manual stop while a prompt is pending
console.log('\n# Manual stop while the prompt is pending')
await waitFor(async () => (await storage()).pendingResume, 'idle again')
const prompt2Opened = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('prompt.html'), timeout: 20_000 })
poke()
const prompt2 = await prompt2Opened
const prompt2Closed = prompt2.waitForEvent('close', { timeout: 10_000 }).then(() => true, () => false)
await popup.goto(url('popup.html'))
await popup.getByRole('button', { name: 'Stay stopped' }).click()
check(await prompt2Closed, 'resolving from the popup closes the prompt window')
const s4 = await storage()
check(!s4.pendingResume && !s4.active, 'no timer running and nothing pending')

// ---- Switch project while a prompt is pending
console.log('\n# Switch project while the prompt is pending')
await startTimer('Homepage')
await waitFor(async () => {
  const s = await storage()
  return s.pendingResume && !s.active
}, 'idle again')
const prompt3Opened = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('prompt.html'), timeout: 20_000 })
poke()
const prompt3 = await prompt3Opened
const prompt3Closed = prompt3.waitForEvent('close', { timeout: 10_000 }).then(() => true, () => false)
await popup.goto(url('popup.html'))
await popup.getByRole('radio', { name: 'Ledgerly' }).check({ force: true })
await popup.getByLabel('Task').fill('Billing bug')
await popup.getByRole('button', { name: /^Start · Ledgerly/ }).click()
check(await prompt3Closed, 'starting another project closes the pending prompt')
const s45 = await storage()
check(!s45.pendingResume, 'pending return cleared by the manual start')
check(s45.projects.find((p) => p.id === s45.active?.projectId)?.name === 'Ledgerly', 'the manually chosen project is running')
check(!Object.keys(await notifications()).includes('ww-ask'), 'ask notification cleared')
await popup.evaluate(() => chrome.runtime.sendMessage({ ww: { cmd: 'stop' } }))

// ---- Cycle 2: Auto-resume (switched through the real dashboard settings UI)
console.log('\n# Auto-resume')
const dash = await ctx.newPage()
await dash.goto(url('dashboard.html'))
await dash.getByRole('button', { name: 'Settings' }).click()
await dash.getByText('Auto-resume', { exact: true }).click()
await waitFor(async () => (await storage()).settings?.onReturn === 'auto', 'setting saved')
await startTimer('Billing bug')
const idle2 = await waitFor(async () => {
  const s = await storage()
  return s.pendingResume && !s.active ? s : null
}, 'idle in auto mode')
await sleep(3000)
const pagesBefore = ctx.pages().filter((p) => p.url().includes('prompt.html')).length
const tBack = Date.now()
poke()
const s5 = await waitFor(async () => {
  const s = await storage()
  return s.active ? s : null
}, 'auto-resume')
check(Math.abs(s5.active.startedAt - tBack) < 3000, 'auto-resumed at the return time')
check(s5.active.projectId === idle2.pendingResume.projectId && s5.active.taskId === idle2.pendingResume.taskId, 'same project and task')
check(s5.autoResumed?.awayStart === idle2.pendingResume.idleSince, 'auto-resume notice records the away start')
check(Object.keys(await notifications()).includes('ww-auto'), '"Resumed on ..." notification shown')
await sleep(1500)
check(ctx.pages().filter((p) => p.url().includes('prompt.html')).length === pagesBefore, 'no prompt window in auto mode')
await popup.goto(url('popup.html'))
check(await popup.getByText(/^Resumed on/).isVisible(), 'popup shows the Resumed banner with Switch')

// ---- Export
console.log('\n# Export')
await dash.bringToFront()
await dash.getByRole('button', { name: 'Overview' }).click()
const dl = dash.waitForEvent('download')
await dash.getByRole('button', { name: 'Export CSV' }).first().click()
const csv = readFileSync(await (await dl).path(), 'utf8').trim().split(/\r?\n/)
check(csv[0].startsWith('entry_id,date,start_local'), 'CSV header present')
check(csv.length - 1 === (await storage()).entries.length, `CSV has every entry (${csv.length - 1})`)

check(external.length === 0, `no network requests outside the extension${external.length ? `: ${external.join(', ')}` : ''}`)
check(errors.length === 0, `no page errors${errors.length ? `:\n  ${errors.join('\n  ')}` : ''}`)

await ctx.close()
console.log(failures ? `\n${failures} check(s) failed` : '\nAll end-to-end checks passed')
process.exit(failures ? 1 : 0)

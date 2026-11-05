# Wherewent

A clickable UI prototype of **Wherewent**, a local-only Chrome time tracker for people juggling several projects, plus its landing page and privacy policy.

The timer stops itself when you go idle. When you come back, it either asks what you are doing or resumes for you, depending on a setting. Nothing leaves the device and there is no account.

This repo has **no extension APIs and no backend**. All data is mocked behind one store interface, so a later session can swap in `chrome.storage` without touching components. There is no `chrome.*` code anywhere.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, Phosphor icons, self-hosted Inter and Newsreader. The visual direction and tokens are documented in [DESIGN.md](./DESIGN.md).

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173/. The prototype shell has a screen switcher across the top, and every screen can be deep-linked by hash:

| Screen | URL | What it shows |
|---|---|---|
| First run | `/#onboarding` | 3-step onboarding inside the 380 × 560 popup: intro, add projects, idle and return behavior |
| Empty state | `/#empty` | Projects set up but nothing tracked: 0m today, an empty Recent hint. Zero projects shows an inline "add your first project" form. |
| Popup: idle | `/#idle` | Pick a project, pick or type a task, big Start, today total, last 3 project/task pairs as one-tap starts |
| Popup: running | `/#running` | Large elapsed clock, project and task, Pause/Resume and Stop, one-tap switch, today total by project |
| Return prompt | `/#return` | 360 × 320 window: away time and start time, "not tracked", Resume (default focus, Enter), Pick another (P), Stay stopped (Esc) |
| Auto-resume | `/#auto-resume` | Desktop notification card plus the popup banner: "Resumed on project / task", Switch, "Away 14m, not tracked" |
| Dashboard | `/#dashboard` | Full tab: Day / Week / Month / 6 Months, time per project bars, daily or weekly totals, day timeline with hatched idle gaps, entries table with inline edit, delete with undo and manual add, projects and tasks with color and archive, CSV and JSON export, settings |
| Landing page | `/src/landing/` | The marketing page |
| Privacy policy | `/src/landing/privacy.html` | The plain-language policy |

The shell also has a theme switch (System, Light, Dark), **Toggle return setting** (Ask me or Auto-resume), and **Simulate idle 14m + return**. The simulate button runs the real store rules: the entry ends at your last activity, the away period is logged, and then you get either the return prompt or an auto-resume. **Reset screen** restores the screen's mock data.

## Build

```bash
npm run build
```

This type-checks and then produces two independent outputs:

- `dist/prototype/`: the prototype shell (`vite.config.ts`)
- `dist/landing/`: the landing page and privacy policy only (`vite.landing.config.ts`, root `src/landing`, relative `base`)

## Preview and deploy the landing page

```bash
npm run build:landing
```

```bash
npm run preview:landing
```

The preview runs at http://localhost:4174/. `dist/landing/` is plain static files (`index.html`, `privacy.html`, hashed assets, `og.png`, `robots.txt`), so you can deploy that folder as-is to any free static host, such as Cloudflare Pages, Netlify, GitHub Pages or Vercel.

Before publishing:

1. Set `VITE_SITE_URL` in `.env` to the real origin. Canonical and Open Graph URLs are built from it. It currently holds the placeholder `https://wherewent.example`.
2. Replace the placeholder `Add to Chrome` and `Install from zip` links. Each one is marked with a `TODO` comment and a `data-placeholder` attribute in `src/landing/index.html`.
3. Add a contact address to the privacy policy (see its `TODO`).

The landing page is static HTML. React only mounts the product visuals into slots whose size is reserved ahead of time, and the visuals below the fold mount as they near the viewport. Those visuals are the real `Popup`, `ReturnPrompt`, `AutoResumeNotification` and `Dashboard` components, rendered with isolated mock stores on a fixed demo clock (today at 3:42 PM). They sit inside the browser, window and popup frames from `src/extension/frames.tsx`, and they are marked `inert` with text captions. There are no third-party requests: fonts are bundled, and there is no analytics and no cookies. Lighthouse (mobile) on the built page scores 100 for performance, accessibility, best practices and SEO.

## The store interface

Everything goes through `src/store.ts`:

```ts
interface WherewentStore {
  getState(): State                         // sync, immutable snapshot
  subscribe(listener: () => void): () => void

  start(ref: TaskRef): Promise<void>        // TaskRef = { projectId, taskId? , taskName? }
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  switchTo(ref: TaskRef): Promise<void>     // close current entry, start next

  goIdle(lastActiveAt: number): Promise<void>
  returnFromIdle(at: number): Promise<void> // decides ask vs auto-resume
  resolveReturn(choice: { action: 'resume' } | ({ action: 'switch' } & TaskRef) | { action: 'stay' }): Promise<void>
  dismissAutoResumeNotice(): Promise<void>

  addEntry(e): Promise<Entry>
  updateEntry(id, patch): Promise<void>
  deleteEntry(id): Promise<Entry | undefined>   // returned for undo
  restoreEntry(entry): Promise<void>

  addProject({ name, color }): Promise<Project>
  updateProject(id, { name?, color?, archived? }): Promise<void>
  addTask(projectId, name): Promise<Task>
  updateTask(id, { name?, archived? }): Promise<void>

  updateSettings(patch: Partial<Settings>): Promise<void>
  completeOnboarding({ projects, settings }): Promise<void>
  exportData(format: 'csv' | 'json'): Promise<string>
}
```

Components only ever call `useWherewent()`, which returns `[state, store]` through `useSyncExternalStore`. The landing page scopes several independent stores with `<StoreProvider store={...}>`. The domain types (`Project`, `Task`, `Entry`, `AwayPeriod`, `Session`, `Settings`, `PendingReturn`, `AutoResumeNotice`) live in `src/types.ts` and are plain JSON.

Swapping in `chrome.storage` later:

1. Implement `WherewentStore` against `chrome.storage.local`. Keep an in-memory snapshot for `getState()`, hydrate it on boot, and update it from `chrome.storage.onChanged`.
2. Change one line in `src/store.ts`: `export const defaultStore = createChromeStore()`.
3. In the background worker, call `goIdle(now - thresholdMs)` when `chrome.idle` reports idle or locked, and `returnFromIdle(now)` when it reports active. Open the return-prompt window when `pendingReturn` is set, and show a notification when `autoResumed` is set.
4. Keep the retention prune (entries and away periods older than `RETENTION_DAYS = 183`). The mock already applies it on load and on every replace.

The in-memory implementation in `src/mock/mockStore.ts` is the reference for the rules: idle closes the running entry at the last activity, away time is never counted, auto-resume falls back to asking when you were away longer than `autoResumeMaxAwayMin`, and typed task names are reused case-insensitively or created on demand.

## Mock data

`src/mock/seed.ts` generates 6 projects (Northwind Clinic portal, Halden Coffee Shopify, Ledgerly (own product), Brightline Legal intake, Sales & proposals, Agency ops) plus one archived project, with 3 to 4 tasks each. It covers 3 weeks of weekday entries (and some Saturdays) built from a seeded random generator. Blocks end by switch, pause, lunch stop or **idle**, and idle endings record an away gap that the timeline shows. Today only contains work that has already happened. Named scenarios for each screen live in `src/mock/scenarios.ts`.

## Layout

```
src/
  store.ts                 store interface, provider, hook (the swap point)
  types.ts                 domain model
  lib/time.ts              formatting and aggregation helpers
  mock/                    in-memory store, seed data, screen scenarios
  extension/
    Popup.tsx              idle, running, empty, auto-resume banner
    Onboarding.tsx         first run
    ReturnPrompt.tsx       return prompt + auto-resume notification
    dashboard/             dashboard, charts, entries, projects, settings
    frames.tsx             popup / window / browser frames (shared with landing)
    ui.tsx                 buttons, segmented control, dots, wordmark
  prototype/               screen-switcher shell (dev only)
  landing/                 index.html, privacy.html, islands, public/ (og.png, robots.txt)
  styles/tokens.css        design tokens, shared by everything
```

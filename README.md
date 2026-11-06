# Wherewent

A Manifest V3 Chrome extension for tracking time across several projects. It runs locally only. The timer stops itself when you go idle. When you come back, it either asks what you are doing or resumes for you, depending on a setting. Nothing leaves the device, and there is no account, no sync and no analytics.

The repo also contains the design prototype and the landing page (see the end of this file). The visual direction and design tokens are documented in [DESIGN.md](./DESIGN.md).

## Build

You need Node 20 or newer.

```bash
npm install
```

```bash
npm run build
```

`npm run build` type-checks the code and writes the extension to `dist/`. The folder contains `manifest.json`, `background.js`, `popup.html`, `dashboard.html`, `prompt.html`, `assets/` and `icons/`.

To run the unit tests and the build together:

```bash
npm run check
```

## Load it in Chrome (your own machine)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist/` folder.
4. Pin Wherewent from the puzzle-piece menu, then click its icon to start onboarding.

After each rebuild, click the reload arrow on the Wherewent card in `chrome://extensions`.

## Share it with a teammate (zip, no store)

```bash
npm run package
```

This builds and writes `wherewent-<version>.zip`, which contains the contents of `dist/`. Send them the zip. They:

1. Unzip it into a folder they will keep, for example `~/Extensions/wherewent`. Chrome loads the folder, not the zip, and the extension disappears if the folder is deleted.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder (the one that contains `manifest.json`).
4. To update later, unzip the new version over the same folder and click the reload arrow on the card. Their data is kept, because it lives in Chrome's storage, not in the folder.

Chrome shows a "developer mode extensions" warning on startup for unpacked extensions. That is expected until the extension is published (see [PUBLISHING.md](./PUBLISHING.md)).

## Developer build

```bash
npm run build:dev
```

This writes to `dist/` too, as "Wherewent (dev)", with sourcemaps. It adds a **15 seconds (testing)** idle threshold in Settings and onboarding, so you can run a full idle cycle in under a minute. `npm run watch` rebuilds on every change. Don't share dev builds.

## Tests

```bash
npm test
```

Vitest with fake timers covers the pure logic in `src/core`:

- Idle backdating.
- Both return modes, plus the long-absence fallback.
- Manual start, stop and switch while a return is pending.
- Laptop sleep, closed-browser recovery and worker restarts.
- Retention pruning, per-project aggregation and the CSV/JSON export.

```bash
npm run e2e
```

This runs after `npm run build`. It loads `dist/` into real Chromium under Xvfb with the real `chrome.idle` API, and uses a small XTEST helper (`e2e/xpoke.c`) to produce genuine "user is back" input. It drives the full start → idle → return → resume cycle in both modes through the UI. It also checks a service worker restart, switching or stopping while the prompt is open, CSV export, and that the extension makes no network requests. It is Linux-only and needs `xvfb-run`, `gcc` with libXtst, and Playwright.

Manual checks that need a real desktop, such as sleep, notification buttons, a blocked-notifications badge and quitting Chrome, are listed in [TESTING.md](./TESTING.md).

## How it works

```
popup.html / dashboard.html / prompt.html          background.js (service worker)
  React UI                                           chrome.idle / alarms / notifications / runtime
  └─ chromeStore (src/ext/chromeStore.ts)            └─ controller (src/core/controller.ts)
       reads chrome.storage.local                         load state → engine step → write changed keys → effects
       + onChanged                                        └─ engine (src/core/engine.ts), pure
       sends every mutation as a message ───────────►
```

- **One writer.** UI pages never write storage. They send commands to the service worker, which serialises them, so the popup, the dashboard, the prompt window and idle events can't race each other.
- **No memory state.** Chrome kills the worker constantly. Every event loads state from `chrome.storage.local`, applies a pure step from `src/core/engine.ts` and writes back only the keys that changed. The heartbeat rewrites `lastSeen`, nothing else.
- **The timer is just timestamps.** The active timer is `{ projectId, taskId, startedAt }`, and elapsed time is always `now - startedAt`. Pause saves the segment as an entry, and Resume starts a new one.
- **Heartbeat.** `chrome.alarms` writes `lastSeen` every minute. A daily alarm prunes old data.

### Idle and return rules

| Event | What happens |
|---|---|
| `chrome.idle` reports `idle` or `locked` (threshold: default 120 s, minimum 15 s) | The active entry is closed at `now - threshold`, which is when you actually stopped. `pendingResume = { projectId, taskId, idleSince }` is stored and the active timer is cleared. Idle time is never counted, including during calls or videos. |
| Back (`active`), **Ask me** (default) | A notification appears with **Resume project / task** and **Choose another**, and the return-prompt window opens. If notifications are blocked, a `!` badge plus the popup banner are shown instead. It never auto-resumes. |
| Back, **Auto-resume** | A new entry starts on the same project and task at the return time, so the away gap stays untracked. A quiet "Resumed on project / task" notification with **Switch** is shown. |
| Back, Auto-resume, away longer than the limit (default 2 h) | Falls back to Ask me for that return. |
| A timer started, stopped or switched by hand while a return is pending | The manual action wins. The pending return, its notification and its window are cleared, and the return does nothing. |
| Heartbeats missed for more than 3 minutes (laptop sleep, so the idle event fires late or not at all) | The entry is capped at `lastSeen`, not at `now - threshold`. Then the return rules apply as soon as you are active. |
| Browser started with a timer still marked active (Chrome was closed or crashed) | The entry is closed at `lastSeen`, `pendingResume` is set, and the return behaviour applies. |
| Service worker restarted mid-session | Nothing is lost, because nothing was held in memory. |

### Retention and export

Entries and away periods older than 183 days are deleted on install, on browser startup and by a daily alarm, and this cannot be turned off. Export is on every dashboard screen (**Export CSV** and **Export JSON** in the header and in Settings). From 14 days before entries expire, a warning with export buttons appears. The CSV includes every entry with local and ISO times, minutes, hours, project, archived flag, task, source and how the entry ended. The JSON includes everything: settings, projects, tasks, entries, away periods and the running timer. Files are created in the page and saved through the browser's normal download, so no `downloads` permission is needed.

### Permissions and privacy

| Permission | Why |
|---|---|
| `storage` | All data lives in `chrome.storage.local`. |
| `unlimitedStorage` | Six months of entries must never hit the default 10 MB quota and silently fail to save. |
| `idle` | To stop the timer when you go idle or lock the screen. |
| `alarms` | The one-minute `lastSeen` heartbeat and the daily retention prune. |
| `notifications` | The return-from-idle and auto-resume notices. |

The extension has no host permissions, no content scripts and no `externally_connectable`, and it runs no remote code. The page CSP sets `connect-src 'none'`, so extension pages cannot make network requests at all. Fonts are bundled.

## Project layout

```
src/
  types.ts                 domain model (stored as-is in chrome.storage.local)
  store.ts                 WherewentStore interface + StoreProvider/useWherewent (UI seam)
  core/                    pure, tested, no chrome.*
    engine.ts              state transitions: timer, idle, return, recovery, retention
    controller.ts          service-worker brain behind Platform + KeyValueArea interfaces
    storage.ts             one storage key per State field, diffed writes
    export.ts              CSV and JSON export
    *.test.ts              Vitest suites
  ext/                     the extension
    background.ts          service worker: chrome.* → controller
    chromeStore.ts         WherewentStore over chrome.storage + messages
    manifest.ts            manifest.json (emitted at build, version from package.json)
    popup.tsx dashboard.tsx prompt.tsx, pages/*.html
  extension/               React UI (shared by the extension, prototype and landing)
  lib/time.ts              formatting and aggregation
  mock/                    in-memory store on the same engine + seed data (prototype/landing)
  prototype/ landing/ styles/
e2e/                       real-Chromium end-to-end test
scripts/zip.mjs            packages dist/ for teammates
public/icons/              extension icons
```

## Prototype and landing page

```bash
npm run dev
```

This serves the clickable design prototype, with mock data and a screen switcher, at http://localhost:5173/, and the landing page at `/src/landing/`. It uses the same engine as the extension, so "Simulate idle 14m + return" follows the real rules.

```bash
npm run build:landing
```

This writes the static landing page and privacy policy to `dist-landing/`. Deploy that folder to any static host. Set `VITE_SITE_URL` in `.env` first, and replace the placeholder install links.

```bash
npm run preview:landing
```

This previews the built landing page.

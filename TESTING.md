# Testing Wherewent

## Automated

| Command | What it covers |
|---|---|
| `npm test` | Vitest with fake timers, covering the pure engine and the service-worker controller over a fake storage. That includes idle backdating, Ask me, Auto-resume, the long-absence fallback, manual start, stop and switch while a return is pending, late idle events after sleep, missed heartbeats, browser-closed recovery on startup, worker restarts, heartbeat writes, the 15 s threshold floor, pruning on install, startup and the daily alarm, per-project aggregation, and CSV/JSON export. |
| `npm run e2e` (after `npm run build`) | The real built extension in Chromium under Xvfb, with real `chrome.idle`. It runs onboarding through the UI, then the start, real idle (15 s), real return (XTEST input), prompt window and notification, Enter-to-resume cycle. It also covers a service worker restart, resolving from the popup closing the prompt window, switching project while the prompt is pending, Auto-resume plus its notification and popup banner, CSV export, no network requests and no page errors. It is Linux-only. |

## Manual checklist

Use a developer build so you can pick the 15 s idle threshold:

```bash
npm run build:dev
```

Load `dist/` unpacked in `chrome://extensions`, and keep that page open so you can reach **Inspect views: service worker** for the worker console.

Useful worker-console snippets:

```js
// See everything
await chrome.storage.local.get(null)
// Pretend you left 3 hours ago (for the long-absence fallback)
const { pendingResume: p } = await chrome.storage.local.get('pendingResume'); await chrome.storage.local.set({ pendingResume: { ...p, idleSince: p.idleSince - 3 * 3600e3 } })
// Add an entry that is 190 days old (for retention)
const { entries, projects } = await chrome.storage.local.get(['entries', 'projects']); const t = Date.now() - 190 * 864e5; await chrome.storage.local.set({ entries: [...entries, { id: 'old', projectId: projects[0].id, taskId: null, start: t, end: t + 36e5, source: 'manual', endedBy: 'manual' }] })
```

### Install and first run

- [ ] Loading `dist/` shows no errors on the extension card, and the permissions are only "Display notifications" (plus idle, alarms and storage, which Chrome doesn't list).
- [ ] Clicking the icon shows onboarding (3 steps). Adding 2 projects, choosing Ask me and the 15 s threshold, then **Start tracking** lands on the idle popup with an empty Recent hint.
- [ ] **Open dashboard** opens one tab, and clicking it again focuses that same tab instead of opening another.

### Start, idle, return: Ask me

- [ ] Pick a project, type a task and press Enter. The popup shows **Tracking** and the clock counts up.
- [ ] Close the popup and reopen it after 30 s. The elapsed time is correct (computed, not counted).
- [ ] Keep working for about 20 s, then hands off for 15 s or more. In the worker console, `active` is `null` and the last entry's `end` is about 15 s before the idle moment (`endedBy: "idle"`).
- [ ] Move the mouse. A notification appears ("You were away …", with **Resume …** and **Choose another**) **and** the 360 × 320 prompt window opens with Resume focused.
- [ ] Press **Enter**. The window closes, the notification goes, and the popup shows a new timer that started at the return. The dashboard timeline shows a hatched away gap between the two entries.
- [ ] Repeat, but click **Resume** in the notification instead. Same result.
- [ ] Repeat with **Choose another** in the notification. The prompt opens on the picker, and choosing a pair starts it.
- [ ] Repeat, pressing **P** in the prompt and then **Esc** twice. The prompt returns to its main view, then you stay stopped and the window closes.
- [ ] Repeat, but close the prompt window with its close button. The popup shows the amber "Away …" banner with Resume and Stay stopped.

### Start, idle, return: Auto-resume

- [ ] In the dashboard, open Settings, choose **Auto-resume** and leave the limit at 2 h.
- [ ] Start a timer, go idle for 15 s or more, then move the mouse. No prompt window appears, the timer is running again on the same project and task from the return time, and a quiet "Resumed on …" notification shows "Away …, not tracked" and **Switch**.
- [ ] Click **Switch**. The prompt window opens as "Switch to", and choosing a pair switches the running timer.
- [ ] Open the popup. The green "Resumed on …" banner shows **Switch**, and the X dismisses it.
- [ ] Long absence: go idle, then before moving the mouse run the "3 hours ago" snippet. When you move the mouse you get the Ask me prompt ("Longer than your 2h auto-resume limit"), not an auto-resume.

### Manual actions while a return is pending

- [ ] With the prompt open, start a different project from the popup. The prompt window closes, the notification clears, and the chosen project runs.
- [ ] With the prompt open, click **Stay stopped** in the popup banner. The window closes and nothing runs.
- [ ] Go idle, then start a timer from the popup before the prompt appears (open the popup with the keyboard). When you come back, nothing happens.

### Notifications blocked

- [ ] Turn off notifications for Wherewent: on the next notification, click its gear and choose "Turn off notifications from Wherewent", or use the OS notification settings for Chrome. Run an Ask me cycle. The prompt window still opens, there is no notification, and the toolbar icon shows an amber **!** badge until you resolve the return.

### Sleep, restart and recovery

- [ ] **Laptop sleep:** start a timer, work for a minute, then close the lid for 10 minutes or more. After waking and unlocking, the entry ends within about a minute of when you closed the lid (capped at `lastSeen`), not 10 minutes later. Then you get the return prompt or an auto-resume, per the setting.
- [ ] **Browser closed:** start a timer and quit Chrome completely (Cmd+Q, or File > Exit). Reopen it after 5 minutes or more. The entry ends at the last heartbeat before quitting, and the return behaviour applies on startup.
- [ ] **Worker restart:** with a timer running, open `chrome://serviceworker-internals`, find Wherewent and click **Stop**. Open the popup. The same timer is still running with the correct elapsed time.
- [ ] **Extension reload:** with a timer running, reload the extension in `chrome://extensions`. The timer keeps running.

### Data

- [ ] Dashboard: edit an entry inline, delete it and **Undo**, then add a manual entry. Each change shows up in the popup's today total.
- [ ] **Export CSV** and **Export JSON** from the header both download. The CSV row count equals the number of entries, and archived projects show `project_archived = true`.
- [ ] Retention: run the "190 days old" snippet, then reload the extension (this triggers onInstalled). The entry is gone. Also check that a 175-day-old entry triggers the "will be deleted in the next 14 days" banner with export buttons.

### Privacy

- [ ] DevTools **Network** on the popup, dashboard and prompt shows only `chrome-extension://` requests. The worker's Network panel is empty.
- [ ] `dist/manifest.json` has no `host_permissions`, `content_scripts` or `externally_connectable`, and its CSP includes `connect-src 'none'`.

### Production build

- [ ] Run `npm run build`, reload, and check that the 15 s option is gone from Settings and onboarding and that the name is "Wherewent" (not "(dev)").

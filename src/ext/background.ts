/**
 * Service worker. Wires chrome.* events into the controller. Holds no state
 * in memory: Chrome kills this worker constantly, and everything it needs is
 * read from chrome.storage on each event. All listeners are registered
 * synchronously at the top level so Chrome can wake the worker for them.
 */
import { createController, type Command, type IdleState, type Platform, type PromptMode } from '../core/controller'
import { HEARTBEAT_MINUTES } from '../core/engine'
import { findProject, findTask, formatDuration, formatTime } from '../lib/time'
import type { State } from '../types'

const ASK_ID = 'ww-ask'
const AUTO_ID = 'ww-auto'
const PROMPT_KEY = 'promptWindowId'
const PROMPT_W = 360
const PROMPT_H = 320

const label = (s: State, projectId: string, taskId: string | null) => {
  const p = findProject(s, projectId)
  const t = findTask(s, taskId)
  return `${p?.name ?? 'project'}${t ? ` / ${t.name}` : ''}`
}

async function notificationsAllowed() {
  try {
    return (await chrome.notifications.getPermissionLevel()) === 'granted'
  } catch {
    return false
  }
}

async function promptWindowId(): Promise<number | null> {
  const { [PROMPT_KEY]: id } = await chrome.storage.session.get(PROMPT_KEY)
  if (typeof id !== 'number') return null
  try {
    await chrome.windows.get(id)
    return id
  } catch {
    await chrome.storage.session.remove(PROMPT_KEY)
    return null
  }
}

async function openPrompt(mode: PromptMode) {
  const url = chrome.runtime.getURL(`prompt.html#${mode}`)
  const existing = await promptWindowId()
  if (existing != null) {
    const [tab] = await chrome.tabs.query({ windowId: existing })
    if (tab?.id != null) await chrome.tabs.update(tab.id, { url })
    await chrome.windows.update(existing, { focused: true, drawAttention: true })
    return
  }
  let left: number | undefined
  let top: number | undefined
  try {
    const anchor = await chrome.windows.getLastFocused({ windowTypes: ['normal'] })
    if (anchor.left != null && anchor.width != null && anchor.top != null && anchor.height != null) {
      left = Math.round(anchor.left + (anchor.width - PROMPT_W) / 2)
      top = Math.round(anchor.top + (anchor.height - PROMPT_H) / 3)
    }
  } catch {
    /* no browser window open: let Chrome place it */
  }
  // Outer size: content is 360 x 320, plus the window title bar.
  const win = await chrome.windows.create({ url, type: 'popup', width: PROMPT_W, height: PROMPT_H + 32, left, top, focused: true })
  if (win?.id != null) await chrome.storage.session.set({ [PROMPT_KEY]: win.id })
}

const platform: Platform = {
  async showAsk(state, pending) {
    if (await notificationsAllowed()) {
      const away = (pending.returnedAt ?? Date.now()) - pending.idleSince
      await chrome.notifications.create(ASK_ID, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/128.png'),
        title: `You were away ${formatDuration(away)}`,
        message: `Since ${formatTime(pending.idleSince)}. Those minutes were not tracked.`,
        contextMessage: 'Wherewent',
        buttons: [{ title: `Resume ${label(state, pending.projectId, pending.taskId)}` }, { title: 'Choose another' }],
        requireInteraction: true,
        priority: 2,
      })
    }
    await openPrompt('return')
  },
  async showAuto(state, notice) {
    if (!(await notificationsAllowed())) return // the popup banner still shows it
    await chrome.notifications.create(AUTO_ID, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/128.png'),
      title: `Resumed on ${label(state, notice.projectId, notice.taskId)}`,
      message: `Away ${formatDuration(notice.returnedAt - notice.awayStart)}, not tracked.`,
      contextMessage: 'Wherewent',
      buttons: [{ title: 'Switch' }],
      silent: true,
      priority: 0,
    })
  },
  async clearReturn() {
    await chrome.notifications.clear(ASK_ID)
    const id = await promptWindowId()
    if (id != null) await chrome.windows.remove(id).catch(() => undefined)
  },
  async clearAuto() {
    await chrome.notifications.clear(AUTO_ID)
  },
  openPrompt,
  async setIdleInterval(seconds) {
    chrome.idle.setDetectionInterval(Math.max(15, Math.round(seconds)))
  },
  async queryIdle(seconds) {
    return (await chrome.idle.queryState(Math.max(15, Math.round(seconds)))) as IdleState
  },
  async syncBadge(state) {
    const asking = state.pendingResume?.returnedAt != null
    // Badge is the fallback when notifications are blocked.
    const showBadge = asking && !(await notificationsAllowed())
    await chrome.action.setBadgeText({ text: showBadge ? '!' : '' })
    if (showBadge) await chrome.action.setBadgeBackgroundColor({ color: '#9a4a07' })
    const title = state.active
      ? `Wherewent: tracking ${label(state, state.active.projectId, state.active.taskId)}`
      : asking
        ? 'Wherewent: you are back. Open to resume.'
        : 'Wherewent'
    await chrome.action.setTitle({ title })
  },
}

const controller = createController({ area: chrome.storage.local, platform })

async function ensureAlarms() {
  if (!(await chrome.alarms.get('heartbeat'))) chrome.alarms.create('heartbeat', { periodInMinutes: HEARTBEAT_MINUTES, delayInMinutes: HEARTBEAT_MINUTES })
  if (!(await chrome.alarms.get('prune'))) chrome.alarms.create('prune', { periodInMinutes: 24 * 60, delayInMinutes: 60 })
}

// Every wake: re-apply the idle threshold and make sure alarms exist.
void controller.init().catch(console.error)
void ensureAlarms()

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarms().then(() => controller.onInstalled())
})

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarms().then(() => controller.onStartup())
})

chrome.idle.onStateChanged.addListener((state) => {
  void controller.onIdleState(state as IdleState)
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') void controller.onHeartbeat()
  else if (alarm.name === 'prune') void controller.onPruneAlarm()
})

chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (id === ASK_ID || id === AUTO_ID) {
    void chrome.notifications.clear(id)
    void controller.onNotificationButton(id === ASK_ID ? 'ask' : 'auto', index)
  }
})

chrome.notifications.onClicked.addListener((id) => {
  if (id === ASK_ID || id === AUTO_ID) {
    void chrome.notifications.clear(id)
    void controller.onNotificationClicked(id === ASK_ID ? 'ask' : 'auto')
  }
})

chrome.windows.onRemoved.addListener((windowId) => {
  void chrome.storage.session.get(PROMPT_KEY).then(({ [PROMPT_KEY]: id }) => {
    if (id === windowId) void chrome.storage.session.remove(PROMPT_KEY)
  })
})

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only our own extension pages talk to the worker (no externally_connectable).
  if (sender.id !== chrome.runtime.id || typeof message !== 'object' || message === null) return false
  const msg = message as { ww?: Command; wwDebug?: { idle?: IdleState; heartbeat?: boolean; startup?: boolean } }
  if (msg.ww) {
    controller.onCommand(msg.ww).then(
      (result) => sendResponse({ ok: true, result }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    )
    return true
  }
  // Developer builds only (npm run build:dev): inject lifecycle events for end-to-end tests.
  if (__WW_DEV__ && msg.wwDebug) {
    const d = msg.wwDebug
    const job = d.idle ? controller.onIdleState(d.idle) : d.heartbeat ? controller.onHeartbeat() : d.startup ? controller.onStartup() : Promise.resolve()
    job.then(
      () => sendResponse({ ok: true }),
      (err: unknown) => sendResponse({ ok: false, error: String(err) }),
    )
    return true
  }
  return false
})

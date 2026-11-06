import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createController } from './controller'
import { fakePlatform, memoryArea } from './testkit'
import { loadState } from './storage'
import { toCSV, toJSON, CSV_COLUMNS } from './export'
import { DEFAULT_SETTINGS } from '../types'

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const T0 = new Date('2026-11-04T09:00:00').getTime()

const seed = {
  onboarded: true,
  projects: [
    { id: 'p1', name: 'Northwind', color: 'pine', archived: false, createdAt: 0 },
    { id: 'p2', name: 'Halden, "Coffee"', color: 'ochre', archived: true, createdAt: 0 },
  ],
  tasks: [{ id: 't1', projectId: 'p1', name: 'Booking flow', archived: false }],
  entries: [],
  away: [],
  settings: DEFAULT_SETTINGS,
  lastSeen: T0,
}

function setup(opts: { onReturn?: 'ask' | 'auto'; idle?: 'active' | 'idle' | 'locked' } = {}) {
  const area = memoryArea({ ...seed, settings: { ...DEFAULT_SETTINGS, onReturn: opts.onReturn ?? 'ask' } })
  const platform = fakePlatform({ idle: opts.idle ?? 'idle' })
  const ctl = createController({ area, platform })
  /** Simulates Chrome waking the worker: a brand-new controller over the same storage. */
  const restart = () => createController({ area, platform })
  /** One minute of heartbeats, like chrome.alarms would fire them. */
  const beats = async (c: ReturnType<typeof createController>, minutes: number) => {
    for (let i = 0; i < minutes; i++) {
      vi.advanceTimersByTime(MIN)
      await c.onHeartbeat()
    }
  }
  return { area, platform, ctl, restart, beats, state: () => loadState(area) }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

describe('full cycle: start, idle, return, resume', () => {
  it('Ask me: notification + prompt on return, Resume button starts a new entry', async () => {
    const { ctl, platform, beats, state } = setup({ onReturn: 'ask' })
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1', taskId: 't1' } })
    await beats(ctl, 30)
    await ctl.onIdleState('idle') // detected at T0+30m
    let s = await state()
    expect(s.active).toBeNull()
    expect(s.entries[0].end).toBe(T0 + 30 * MIN - 120 * SEC)

    await beats(ctl, 14)
    platform.idleState = 'active'
    await ctl.onIdleState('active')
    expect(platform.calls).toContainEqual({ type: 'ask', projectId: 'p1', idleSince: T0 + 28 * MIN, returnedAt: T0 + 44 * MIN })
    s = await state()
    expect(s.active).toBeNull() // never auto-resumes in Ask me

    vi.advanceTimersByTime(20 * SEC)
    await ctl.onNotificationButton('ask', 0)
    s = await state()
    expect(s.active).toEqual({ projectId: 'p1', taskId: 't1', startedAt: T0 + 44 * MIN + 20 * SEC })
    expect(platform.calls.at(-1)).toEqual({ type: 'clear-return' })
  })

  it('Ask me: "Choose another" opens the prompt in pick mode', async () => {
    const { ctl, platform } = setup()
    await ctl.onNotificationButton('ask', 1)
    expect(platform.calls).toContainEqual({ type: 'open-prompt', mode: 'pick' })
  })

  it('Auto-resume: resumes at the return time with a Switch notification', async () => {
    const { ctl, platform, beats, state } = setup({ onReturn: 'auto' })
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1', taskId: 't1' } })
    await beats(ctl, 20)
    await ctl.onIdleState('idle')
    await beats(ctl, 14)
    platform.idleState = 'active'
    await ctl.onIdleState('active')
    const s = await state()
    expect(s.active).toEqual({ projectId: 'p1', taskId: 't1', startedAt: T0 + 34 * MIN })
    expect(platform.calls).toContainEqual({ type: 'auto', projectId: 'p1', awayStart: T0 + 18 * MIN, returnedAt: T0 + 34 * MIN })
    await ctl.onNotificationButton('auto', 0)
    expect(platform.calls.at(-1)).toEqual({ type: 'open-prompt', mode: 'switch' })
  })

  it('Auto-resume over the limit asks instead', async () => {
    const { ctl, platform, beats, state } = setup({ onReturn: 'auto' })
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1' } })
    await beats(ctl, 10)
    await ctl.onIdleState('idle')
    await beats(ctl, 3 * 60)
    platform.idleState = 'active'
    await ctl.onIdleState('active')
    expect((await state()).active).toBeNull()
    expect(platform.calls.some((c) => c.type === 'ask')).toBe(true)
    expect(platform.calls.some((c) => c.type === 'auto')).toBe(false)
  })
})

describe('worker restarts and recovery', () => {
  it('service worker restart mid-session keeps the timer; elapsed comes from storage', async () => {
    const { ctl, restart, beats, state } = setup()
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1', taskId: 't1' } })
    await beats(ctl, 25)
    const fresh = restart() // nothing carried over in memory
    await fresh.init()
    await fresh.onCommand({ cmd: 'sync' })
    const s = await state()
    expect(s.active).toEqual({ projectId: 'p1', taskId: 't1', startedAt: T0 })
    expect(Date.now() - s.active!.startedAt).toBe(25 * MIN)
    expect(s.entries).toEqual([])
  })

  it('restart between heartbeats: no data loss', async () => {
    const { ctl, restart, beats, state } = setup()
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1', taskId: 't1' } })
    await beats(ctl, 10)
    const w2 = restart()
    await beats(w2, 10)
    const w3 = restart()
    vi.advanceTimersByTime(30 * SEC)
    await w3.onCommand({ cmd: 'stop' })
    const s = await state()
    expect(s.entries).toHaveLength(1)
    expect(s.entries[0].end - s.entries[0].start).toBe(20 * MIN + 30 * SEC)
  })

  it('heartbeat writes only lastSeen', async () => {
    const { ctl, area } = setup()
    area.writes.length = 0
    vi.advanceTimersByTime(MIN)
    await ctl.onHeartbeat()
    expect(area.writes).toEqual([{ lastSeen: T0 + MIN }])
  })

  it('laptop sleep: late locked event caps the entry at lastSeen', async () => {
    const { ctl, beats, state } = setup()
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1' } })
    await beats(ctl, 45) // lastSeen = T0+45m
    vi.advanceTimersByTime(6 * HOUR) // asleep: no alarms
    await ctl.onIdleState('locked')
    const s = await state()
    expect(s.entries[0].end).toBe(T0 + 45 * MIN)
    expect(s.pendingResume?.idleSince).toBe(T0 + 45 * MIN)
  })

  it('laptop sleep with no idle event at all: the first heartbeat after wake recovers and asks if the user is active', async () => {
    const { ctl, platform, beats, state } = setup({ idle: 'active' })
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1' } })
    await beats(ctl, 45)
    vi.advanceTimersByTime(6 * HOUR)
    await ctl.onHeartbeat()
    const s = await state()
    expect(s.entries[0].end).toBe(T0 + 45 * MIN)
    expect(s.pendingResume?.returnedAt).toBe(T0 + 45 * MIN + 6 * HOUR)
    expect(platform.calls.some((c) => c.type === 'ask')).toBe(true)
  })

  it('browser closed while running: startup closes at lastSeen, then applies Ask me', async () => {
    const { ctl, platform, beats, restart, state } = setup({ idle: 'active' })
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1', taskId: 't1' } })
    await beats(ctl, 90)
    vi.advanceTimersByTime(10 * HOUR) // browser closed overnight
    await restart().onStartup()
    const s = await state()
    expect(s.entries[0]).toMatchObject({ start: T0, end: T0 + 90 * MIN, endedBy: 'idle' })
    expect(s.pendingResume).toMatchObject({ idleSince: T0 + 90 * MIN, reason: 'ask' })
    expect(platform.calls.filter((c) => c.type === 'ask')).toHaveLength(1)
  })

  it('browser closed briefly in Auto-resume: startup resumes', async () => {
    const { ctl, platform, beats, restart, state } = setup({ onReturn: 'auto', idle: 'active' })
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1', taskId: 't1' } })
    await beats(ctl, 30)
    vi.advanceTimersByTime(5 * MIN)
    await restart().onStartup()
    const s = await state()
    expect(s.active?.startedAt).toBe(T0 + 35 * MIN)
    expect(s.entries[0].end).toBe(T0 + 30 * MIN)
    expect(platform.calls.some((c) => c.type === 'auto')).toBe(true)
  })

  it('startup while the user is not active yet waits for the active event', async () => {
    const { ctl, platform, beats, restart, state } = setup({ idle: 'idle' })
    await ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1' } })
    await beats(ctl, 5)
    vi.advanceTimersByTime(HOUR)
    const w = restart()
    await w.onStartup()
    expect((await state()).pendingResume?.returnedAt).toBeNull()
    expect(platform.calls.some((c) => c.type === 'ask')).toBe(false)
    platform.idleState = 'active'
    await w.onIdleState('active')
    expect(platform.calls.some((c) => c.type === 'ask')).toBe(true)
  })
})

describe('commands while a return is pending', () => {
  async function pendingAsk() {
    const ctx = setup({ onReturn: 'ask' })
    await ctx.ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1', taskId: 't1' } })
    await ctx.beats(ctx.ctl, 10)
    await ctx.ctl.onIdleState('idle')
    await ctx.beats(ctx.ctl, 5)
    ctx.platform.idleState = 'active'
    await ctx.ctl.onIdleState('active')
    return ctx
  }

  it('manual stop while the prompt is pending closes the prompt and the late Resume does nothing', async () => {
    const { ctl, platform, state } = await pendingAsk()
    await ctl.onCommand({ cmd: 'stop' })
    expect(platform.calls.at(-1)).toEqual({ type: 'clear-return' })
    await ctl.onNotificationButton('ask', 0)
    expect((await state()).active).toBeNull()
  })

  it('switching project while the prompt is pending wins over the prompt', async () => {
    const { ctl, state } = await pendingAsk()
    await ctl.onCommand({ cmd: 'switchTo', ref: { projectId: 'p1', taskName: 'QA pass' } })
    await ctl.onNotificationButton('ask', 0)
    const s = await state()
    expect(s.pendingResume).toBeNull()
    expect(s.tasks.find((t) => t.id === s.active?.taskId)?.name).toBe('QA pass')
  })

  it('a timer started by hand before the user is detected active: return does nothing', async () => {
    const ctx = setup({ onReturn: 'auto' })
    await ctx.ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1' } })
    await ctx.beats(ctx.ctl, 10)
    await ctx.ctl.onIdleState('idle')
    vi.advanceTimersByTime(MIN)
    await ctx.ctl.onCommand({ cmd: 'start', ref: { projectId: 'p1', taskName: 'Something else' } })
    ctx.platform.idleState = 'active'
    await ctx.ctl.onIdleState('active')
    expect(ctx.platform.calls.some((c) => c.type === 'auto' || c.type === 'ask')).toBe(false)
  })
})

describe('settings and retention', () => {
  it('changing the threshold re-applies the idle interval with a 15 s floor', async () => {
    const { ctl, platform, state } = setup()
    await ctl.onCommand({ cmd: 'updateSettings', patch: { idleThresholdSec: 3 } })
    expect((await state()).settings.idleThresholdSec).toBe(15)
    expect(platform.calls).toContainEqual({ type: 'idle-interval', seconds: 15 })
  })

  it('install and the daily alarm prune old entries', async () => {
    const old = T0 - 200 * 24 * HOUR
    const area = memoryArea({ ...seed, entries: [{ id: 'x', projectId: 'p1', taskId: null, start: old, end: old + 1, source: 'timer', endedBy: 'stop' }] })
    const ctl = createController({ area, platform: fakePlatform() })
    await ctl.onInstalled()
    expect((await loadState(area)).entries).toEqual([])
    await area.set({ entries: [{ id: 'y', projectId: 'p1', taskId: null, start: old, end: old + 1, source: 'timer', endedBy: 'stop' }] })
    await ctl.onPruneAlarm()
    expect((await loadState(area)).entries).toEqual([])
  })
})

describe('export', () => {
  it('CSV has every entry, ISO times, archived flags and escapes commas/quotes', async () => {
    const { ctl, state } = setup()
    await ctl.onCommand({ cmd: 'addEntry', entry: { projectId: 'p2', taskId: null, start: T0 - 2 * HOUR, end: T0 - HOUR } })
    await ctl.onCommand({ cmd: 'addEntry', entry: { projectId: 'p1', taskId: 't1', start: T0 - HOUR, end: T0 - 30 * MIN } })
    const csv = toCSV(await state())
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe(CSV_COLUMNS.join(','))
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('"Halden, ""Coffee"""')
    expect(lines[1]).toContain(',true,')
    expect(lines[1]).toContain(new Date(T0 - 2 * HOUR).toISOString())
    expect(lines[2]).toContain(',30,0.5,Northwind,false,Booking flow,manual,manual')
  })

  it('JSON round-trips projects, tasks, entries, away periods and settings', async () => {
    const { ctl, state } = setup()
    await ctl.onCommand({ cmd: 'addEntry', entry: { projectId: 'p1', taskId: null, start: T0 - HOUR, end: T0 } })
    const json = JSON.parse(toJSON(await state(), T0))
    expect(json.projects).toHaveLength(2)
    expect(json.tasks).toHaveLength(1)
    expect(json.entries).toHaveLength(1)
    expect(json.settings.idleThresholdSec).toBe(120)
    expect(json.awayPeriods).toEqual([])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as E from './engine'
import type { State } from '../types'
import { RETENTION_DAYS } from '../types'
import { totalsByProject, entriesWithLive } from '../lib/time'

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const T0 = new Date('2026-11-04T09:00:00').getTime()

function base(over: Partial<State> = {}): State {
  return {
    ...E.emptyState(),
    onboarded: true,
    projects: [
      { id: 'p1', name: 'Northwind', color: 'pine', archived: false, createdAt: 0 },
      { id: 'p2', name: 'Halden', color: 'ochre', archived: false, createdAt: 0 },
    ],
    tasks: [{ id: 't1', projectId: 'p1', name: 'Booking flow', archived: false }],
    ...over,
  }
}

const running = (over: Partial<State> = {}) =>
  base({ active: { projectId: 'p1', taskId: 't1', startedAt: T0 }, lastSeen: T0, ...over })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

describe('timer basics', () => {
  it('stores only {projectId, taskId, startedAt}; elapsed comes from timestamps', () => {
    const s = E.start(base(), { projectId: 'p1', taskId: 't1' }, T0).state
    expect(s.active).toEqual({ projectId: 'p1', taskId: 't1', startedAt: T0 })
    vi.advanceTimersByTime(25 * MIN)
    const stopped = E.stop(s, Date.now()).state
    expect(stopped.active).toBeNull()
    expect(stopped.entries).toHaveLength(1)
    expect(stopped.entries[0].end - stopped.entries[0].start).toBe(25 * MIN)
  })

  it('creates a task from a typed name and reuses it case-insensitively', () => {
    const a = E.start(base(), { projectId: 'p2', taskName: 'Theme build' }, T0).state
    const b = E.start(a, { projectId: 'p2', taskName: 'theme BUILD' }, T0 + MIN).state
    expect(b.tasks.filter((t) => t.projectId === 'p2')).toHaveLength(1)
    expect(b.active?.taskId).toBe(a.active?.taskId)
  })

  it('switching closes the current entry and starts the next at the same instant', () => {
    const s = E.switchTo(running(), { projectId: 'p2' }, T0 + 40 * MIN).state
    expect(s.entries[0]).toMatchObject({ projectId: 'p1', end: T0 + 40 * MIN, endedBy: 'switch' })
    expect(s.active).toMatchObject({ projectId: 'p2', startedAt: T0 + 40 * MIN })
  })

  it('pause saves the segment, resume starts a fresh entry', () => {
    const p = E.pause(running(), T0 + 10 * MIN).state
    expect(p.active).toBeNull()
    expect(p.paused).toMatchObject({ projectId: 'p1', startedAt: T0, pausedAt: T0 + 10 * MIN })
    const r = E.resume(p, T0 + 15 * MIN).state
    expect(r.active).toMatchObject({ projectId: 'p1', taskId: 't1', startedAt: T0 + 15 * MIN })
    expect(r.entries.map((e) => e.end - e.start)).toEqual([10 * MIN])
  })
})

describe('idle backdating', () => {
  it('closes the entry at now minus the threshold and sets pendingResume', () => {
    const now = T0 + 30 * MIN
    const r = E.idle(running({ lastSeen: now - 20 * SEC }), now)
    expect(r.state.active).toBeNull()
    expect(r.state.entries[0]).toMatchObject({ start: T0, end: now - 120 * SEC, endedBy: 'idle' })
    expect(r.state.pendingResume).toEqual({ projectId: 'p1', taskId: 't1', idleSince: now - 120 * SEC, returnedAt: null, reason: null })
  })

  it('uses the configured threshold (15 s minimum)', () => {
    const s = E.updateSettings(running(), { idleThresholdSec: 5 }).state
    expect(s.settings.idleThresholdSec).toBe(15)
    const now = T0 + 10 * MIN
    expect(E.idle({ ...s, lastSeen: now }, now).state.entries[0].end).toBe(now - 15 * SEC)
  })

  it('never ends before the entry started', () => {
    const now = T0 + 30 * SEC
    const r = E.idle(running({ lastSeen: now }), now)
    expect(r.state.entries).toHaveLength(0) // 0-length entry dropped
    expect(r.state.pendingResume?.idleSince).toBe(T0)
  })

  it('does nothing without a running timer', () => {
    const s = base()
    expect(E.idle(s, T0).state).toBe(s)
  })
})

describe('return: Ask me', () => {
  it('asks, records the away gap, and never auto-resumes', () => {
    const idleAt = T0 + 60 * MIN
    const gone = E.idle(running({ lastSeen: idleAt }), idleAt).state
    const back = T0 + 75 * MIN
    const r = E.active(gone, back)
    expect(r.state.active).toBeNull()
    expect(r.state.pendingResume).toMatchObject({ returnedAt: back, reason: 'ask' })
    expect(r.effects).toEqual([{ type: 'ask', pending: r.state.pendingResume }])
    expect(r.state.away).toHaveLength(1)
    expect(r.state.away[0]).toMatchObject({ start: idleAt - 2 * MIN, end: back })
  })

  it('a second active event while asking does not ask again', () => {
    const gone = E.idle(running({ lastSeen: T0 + HOUR }), T0 + HOUR).state
    const asked = E.active(gone, T0 + HOUR + 10 * MIN).state
    const again = E.active(asked, T0 + HOUR + 11 * MIN)
    expect(again.effects).toEqual([])
    expect(again.state.away).toHaveLength(1)
  })

  it('resume starts a new entry at the click, leaving the away time untracked', () => {
    const gone = E.idle(running({ lastSeen: T0 + HOUR }), T0 + HOUR).state
    const asked = E.active(gone, T0 + HOUR + 10 * MIN).state
    const click = T0 + HOUR + 11 * MIN
    const r = E.resolveReturn(asked, { action: 'resume' }, click)
    expect(r.state.active).toEqual({ projectId: 'p1', taskId: 't1', startedAt: click })
    expect(r.state.pendingResume).toBeNull()
    expect(r.effects).toContainEqual({ type: 'clear-return' })
    const tracked = r.state.entries.reduce((n, e) => n + e.end - e.start, 0)
    expect(tracked).toBe(HOUR - 2 * MIN)
  })

  it('stay stopped clears the prompt and starts nothing', () => {
    const gone = E.idle(running({ lastSeen: T0 + HOUR }), T0 + HOUR).state
    const asked = E.active(gone, T0 + HOUR + MIN).state
    const r = E.resolveReturn(asked, { action: 'stay' }, T0 + HOUR + 2 * MIN)
    expect(r.state.active).toBeNull()
    expect(r.state.pendingResume).toBeNull()
  })
})

describe('return: Auto-resume', () => {
  const auto = (s: State) => ({ ...s, settings: { ...s.settings, onReturn: 'auto' as const } })

  it('starts a new entry on the same project/task at the return time', () => {
    const gone = E.idle(auto(running({ lastSeen: T0 + HOUR })), T0 + HOUR).state
    const back = T0 + HOUR + 14 * MIN
    const r = E.active(gone, back)
    expect(r.state.active).toEqual({ projectId: 'p1', taskId: 't1', startedAt: back })
    expect(r.state.pendingResume).toBeNull()
    expect(r.state.autoResumed).toEqual({ projectId: 'p1', taskId: 't1', awayStart: T0 + HOUR - 2 * MIN, returnedAt: back })
    expect(r.effects).toEqual([{ type: 'auto', notice: r.state.autoResumed }])
    // the gap between the two entries is exactly the away time
    expect(r.state.active!.startedAt - r.state.entries[0].end).toBe(16 * MIN)
  })

  it('falls back to asking when away longer than the limit (default 2 h)', () => {
    const gone = E.idle(auto(running({ lastSeen: T0 + HOUR })), T0 + HOUR).state
    const r = E.active(gone, T0 + HOUR + 2 * HOUR + MIN)
    expect(r.state.active).toBeNull()
    expect(r.state.pendingResume).toMatchObject({ reason: 'too-long' })
    expect(r.effects[0].type).toBe('ask')
  })

  it('exactly at the limit still auto-resumes', () => {
    const gone = E.idle(auto(running({ lastSeen: T0 + HOUR })), T0 + HOUR).state
    const r = E.active(gone, gone.pendingResume!.idleSince + 120 * MIN)
    expect(r.state.active).not.toBeNull()
  })

  it('does not auto-resume into an archived project', () => {
    let s = E.idle(auto(running({ lastSeen: T0 + HOUR })), T0 + HOUR).state
    s = E.updateProject(s, 'p1', { archived: true }, T0 + HOUR).state
    const r = E.active(s, T0 + HOUR + 5 * MIN)
    expect(r.state.active).toBeNull()
    expect(r.state.pendingResume?.reason).toBe('ask')
  })
})

describe('manual actions while a return is pending', () => {
  for (const mode of ['ask', 'auto'] as const) {
    it(`${mode}: a timer started by hand wins; the return does nothing`, () => {
      let s = E.idle(running({ settings: { ...E.emptyState().settings, onReturn: mode }, lastSeen: T0 + HOUR }), T0 + HOUR).state
      s = E.start(s, { projectId: 'p2' }, T0 + HOUR + 5 * MIN).state
      expect(s.pendingResume).toBeNull()
      const r = E.active(s, T0 + HOUR + 6 * MIN)
      expect(r.state.active).toMatchObject({ projectId: 'p2', startedAt: T0 + HOUR + 5 * MIN })
      expect(r.effects.filter((e) => e.type === 'ask' || e.type === 'auto')).toEqual([])
    })
  }

  it('manual stop while the prompt is open clears it', () => {
    let s = E.idle(running({ lastSeen: T0 + HOUR }), T0 + HOUR).state
    s = E.active(s, T0 + HOUR + 3 * MIN).state
    const r = E.stop(s, T0 + HOUR + 4 * MIN)
    expect(r.state.pendingResume).toBeNull()
    expect(r.state.active).toBeNull()
    expect(r.effects).toContainEqual({ type: 'clear-return' })
  })

  it('switching project while the prompt is open starts the new one and clears the prompt', () => {
    let s = E.idle(running({ lastSeen: T0 + HOUR }), T0 + HOUR).state
    s = E.active(s, T0 + HOUR + 3 * MIN).state
    const r = E.switchTo(s, { projectId: 'p2' }, T0 + HOUR + 4 * MIN)
    expect(r.state.active).toMatchObject({ projectId: 'p2' })
    expect(r.state.pendingResume).toBeNull()
    expect(r.effects).toContainEqual({ type: 'clear-return' })
    // the Resume button pressed later does nothing
    expect(E.resolveReturn(r.state, { action: 'resume' }, T0 + HOUR + 5 * MIN).state).toBe(r.state)
  })
})

describe('sleep and restart recovery', () => {
  it('late idle event after sleep: entry is capped at lastSeen, not now minus threshold', () => {
    const lastBeat = T0 + 50 * MIN
    const wake = T0 + 5 * HOUR // idle/locked fires only on wake
    const r = E.idle(running({ lastSeen: lastBeat }), wake)
    expect(r.state.entries[0].end).toBe(lastBeat)
    expect(r.state.pendingResume?.idleSince).toBe(lastBeat)
  })

  it('heartbeat firing first after wake also caps at the old lastSeen', () => {
    const r = E.heartbeat(running({ lastSeen: T0 + 50 * MIN }), T0 + 5 * HOUR)
    expect(r.state.entries[0].end).toBe(T0 + 50 * MIN)
    expect(r.state.lastSeen).toBe(T0 + 5 * HOUR)
  })

  it('normal heartbeats do not touch a running timer', () => {
    let s = running()
    for (let i = 1; i <= 30; i++) s = E.heartbeat(s, T0 + i * MIN).state
    expect(s.active).toEqual(running().active)
    expect(s.entries).toHaveLength(0)
  })

  it('browser closed while running: startup closes at lastSeen and sets pendingResume', () => {
    const r = E.startup(running({ lastSeen: T0 + 2 * HOUR }), T0 + 14 * HOUR)
    expect(r.state.active).toBeNull()
    expect(r.state.entries[0]).toMatchObject({ start: T0, end: T0 + 2 * HOUR, endedBy: 'idle' })
    expect(r.state.pendingResume).toMatchObject({ idleSince: T0 + 2 * HOUR, returnedAt: null })
  })

  it('startup drops a stale unanswered prompt from the previous session', () => {
    const s = base({ pendingResume: { projectId: 'p1', taskId: null, idleSince: T0, returnedAt: T0 + MIN, reason: 'ask' } })
    expect(E.startup(s, T0 + DAY).state.pendingResume).toBeNull()
  })
})

describe('retention', () => {
  it('prunes entries and away periods older than 6 months only', () => {
    const now = T0
    const old = now - (RETENTION_DAYS + 1) * DAY
    const keep = now - (RETENTION_DAYS - 1) * DAY
    const s = base({
      entries: [
        { id: 'old', projectId: 'p1', taskId: null, start: old, end: old + HOUR, source: 'timer', endedBy: 'stop' },
        { id: 'keep', projectId: 'p1', taskId: null, start: keep, end: keep + HOUR, source: 'timer', endedBy: 'stop' },
      ],
      away: [{ id: 'a', start: old, end: old + MIN }],
    })
    const p = E.prune(s, now)
    expect(p.entries.map((e) => e.id)).toEqual(['keep'])
    expect(p.away).toEqual([])
    expect(E.prune(p, now)).toBe(p) // no-op keeps reference
  })

  it('startup prunes too', () => {
    const old = T0 - 200 * DAY
    const s = base({ entries: [{ id: 'x', projectId: 'p1', taskId: null, start: old, end: old + 1, source: 'timer', endedBy: 'stop' }] })
    expect(E.startup(s, T0).state.entries).toEqual([])
  })

  it('flags entries that will expire within 14 days', () => {
    const soon = T0 - (RETENTION_DAYS - 7) * DAY
    const s = base({ entries: [{ id: 's', projectId: 'p1', taskId: null, start: soon, end: soon + HOUR, source: 'timer', endedBy: 'stop' }] })
    expect(E.expiringSoon(s, T0).map((e) => e.id)).toEqual(['s'])
  })
})

describe('per-project aggregation', () => {
  it('sums per project, clips to the range, and includes the live timer', () => {
    const day = new Date('2026-11-04T00:00:00').getTime()
    const s = base({
      entries: [
        // crosses midnight into the range: only the 30 min after midnight count
        { id: 'a', projectId: 'p1', taskId: null, start: day - 30 * MIN, end: day + 30 * MIN, source: 'timer', endedBy: 'stop' },
        { id: 'b', projectId: 'p2', taskId: null, start: day + 9 * HOUR, end: day + 10 * HOUR, source: 'timer', endedBy: 'stop' },
        { id: 'c', projectId: 'p1', taskId: null, start: day + 11 * HOUR, end: day + 11.5 * HOUR, source: 'manual', endedBy: 'manual' },
      ],
      active: { projectId: 'p2', taskId: null, startedAt: day + 14 * HOUR },
    })
    const now = day + 14.75 * HOUR
    const totals = totalsByProject(entriesWithLive(s, now), s.projects, day, day + DAY)
    expect(totals.map((t) => [t.project.id, t.ms / MIN])).toEqual([
      ['p2', 105],
      ['p1', 60],
    ])
  })
})

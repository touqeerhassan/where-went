/**
 * Pure state transitions. No chrome.*, no timers, no clocks: every function
 * takes the current state and `now` and returns the next state plus a list of
 * side effects for the caller (the service worker) to perform.
 *
 * Rules that matter:
 *  - Time is only ever derived from timestamps (active.startedAt, entry start/end).
 *  - Idle closes the running entry at `now - threshold`: when the user actually stopped.
 *  - If heartbeats were missed (sleep, browser closed), the entry is capped at `lastSeen`.
 *  - Away time is never tracked. Resuming always starts a new entry at the return time.
 *  - Any manual timer action supersedes a pending return.
 */
import {
  DEFAULT_SETTINGS,
  MIN_IDLE_SEC,
  RETENTION_DAYS,
  type ActiveTimer,
  type AutoResumeNotice,
  type Entry,
  type EntryEnd,
  type PendingResume,
  type Project,
  type ProjectColor,
  type Settings,
  type State,
  type Task,
} from '../types'

const MIN = 60_000
const DAY = 24 * 60 * MIN

export const HEARTBEAT_MINUTES = 1
/** Missing heartbeats for longer than this means the machine slept or the browser was closed. */
export const SLEEP_GAP_MS = 3 * MIN

export type Effect =
  /** Ask me: notification with Resume / Choose another, plus the return-prompt window. */
  | { type: 'ask'; pending: PendingResume }
  /** Auto-resume happened: low-key notification with a Switch button. */
  | { type: 'auto'; notice: AutoResumeNotice }
  /** Close the ask notification and prompt window, clear the badge. */
  | { type: 'clear-return' }
  /** Close the auto-resume notification. */
  | { type: 'clear-auto' }
  /** Apply a new idle detection interval. */
  | { type: 'idle-interval'; seconds: number }

export interface Step {
  state: State
  effects: Effect[]
}

export interface TaskRef {
  projectId: string
  taskId?: string | null
  taskName?: string
}

export type ReturnChoice = { action: 'resume' } | ({ action: 'switch' } & TaskRef) | { action: 'stay' }

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

export function emptyState(): State {
  return {
    onboarded: false,
    projects: [],
    tasks: [],
    entries: [],
    away: [],
    settings: { ...DEFAULT_SETTINGS },
    active: null,
    paused: null,
    pendingResume: null,
    autoResumed: null,
    lastSeen: null,
  }
}

export const clampThreshold = (sec: number) => Math.max(MIN_IDLE_SEC, Math.round(Number.isFinite(sec) ? sec : DEFAULT_SETTINGS.idleThresholdSec))

const done = (state: State, effects: Effect[] = []): Step => ({ state, effects })

/* ------------------------------------------------------------- helpers */

/** Close the running timer into an entry ending at `end` (never before it started). */
function closeActive(s: State, end: number, endedBy: EntryEnd): State {
  const a = s.active
  if (!a) return s
  const stop = Math.max(a.startedAt, end)
  const entry: Entry = {
    id: newId('e'),
    projectId: a.projectId,
    taskId: a.taskId,
    start: a.startedAt,
    end: stop,
    source: 'timer',
    endedBy,
  }
  return { ...s, active: null, entries: stop - a.startedAt >= 1000 ? [...s.entries, entry] : s.entries }
}

function resolveTask(s: State, ref: TaskRef): { state: State; taskId: string | null } {
  if (ref.taskId) return { state: s, taskId: ref.taskId }
  const name = ref.taskName?.trim()
  if (!name) return { state: s, taskId: null }
  const existing = s.tasks.find((t) => t.projectId === ref.projectId && t.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    if (!existing.archived) return { state: s, taskId: existing.id }
    return { state: { ...s, tasks: s.tasks.map((t) => (t.id === existing.id ? { ...t, archived: false } : t)) }, taskId: existing.id }
  }
  const task: Task = { id: newId('t'), projectId: ref.projectId, name, archived: false }
  return { state: { ...s, tasks: [...s.tasks, task] }, taskId: task.id }
}

/** A manual timer action supersedes any pending return or auto-resume notice. */
function supersede(s: State, effects: Effect[]): State {
  let next = s
  if (next.pendingResume) {
    next = { ...next, pendingResume: null }
    effects.push({ type: 'clear-return' })
  }
  if (next.autoResumed) {
    next = { ...next, autoResumed: null }
    effects.push({ type: 'clear-auto' })
  }
  return next
}

function begin(s: State, ref: TaskRef, now: number, endedBy: EntryEnd): Step {
  const effects: Effect[] = []
  let next = closeActive(s, now, endedBy)
  next = supersede(next, effects)
  const r = resolveTask(next, ref)
  const active: ActiveTimer = { projectId: ref.projectId, taskId: r.taskId, startedAt: now }
  return done({ ...r.state, active, paused: null, lastSeen: now }, effects)
}

/* ---------------------------------------------------------- timer actions */

export function start(s: State, ref: TaskRef, now: number): Step {
  return begin(s, ref, now, 'stop')
}

export function switchTo(s: State, ref: TaskRef, now: number): Step {
  return begin(s, ref, now, 'switch')
}

export function stop(s: State, now: number): Step {
  const effects: Effect[] = []
  let next = closeActive(s, now, 'stop')
  next = supersede({ ...next, paused: null, lastSeen: now }, effects)
  return done(next, effects)
}

export function pause(s: State, now: number): Step {
  if (!s.active) return done(s)
  const a = s.active
  const next = closeActive(s, now, 'pause')
  return done({ ...next, paused: { ...a, pausedAt: now }, lastSeen: now })
}

export function resume(s: State, now: number): Step {
  if (!s.paused) return done(s)
  const { projectId, taskId } = s.paused
  return begin(s, { projectId, taskId }, now, 'stop')
}

/* ------------------------------------------------------------- idle logic */

/**
 * Detect missed heartbeats. If the timer was running and nothing has been seen
 * for longer than SLEEP_GAP_MS, the machine slept or the browser was not
 * running: close the entry at `lastSeen` and remember what to resume.
 */
export function reconcile(s: State, now: number): Step {
  if (!s.active || s.lastSeen == null || now - s.lastSeen <= SLEEP_GAP_MS) return done(s)
  return goneAt(s, s.lastSeen)
}

/** Close the active entry at `at` and set pendingResume. */
function goneAt(s: State, at: number): Step {
  const a = s.active
  if (!a) return done(s)
  const idleSince = Math.max(a.startedAt, at)
  const effects: Effect[] = []
  let next = closeActive(s, idleSince, 'idle')
  if (next.autoResumed) {
    next = { ...next, autoResumed: null }
    effects.push({ type: 'clear-auto' })
  }
  const pendingResume: PendingResume = { projectId: a.projectId, taskId: a.taskId, idleSince, returnedAt: null, reason: null }
  return done({ ...next, pendingResume }, effects)
}

/** chrome.idle reported 'idle' or 'locked'. */
export function idle(s: State, now: number): Step {
  const r = reconcile(s, now)
  if (!r.state.active) return r
  const step = goneAt(r.state, now - r.state.settings.idleThresholdSec * 1000)
  return { state: step.state, effects: [...r.effects, ...step.effects] }
}

/** chrome.idle reported 'active': the user is back. */
export function active(s: State, now: number): Step {
  const r = reconcile(s, now)
  const effects = [...r.effects]
  let next: State = { ...r.state, lastSeen: now }
  const p = next.pendingResume

  // The user already started something by hand while the return was pending: do nothing.
  if (next.active) {
    if (p) {
      next = { ...next, pendingResume: null }
      effects.push({ type: 'clear-return' })
    }
    return done(next, effects)
  }
  // Nothing to resume, or we are already asking.
  if (!p || p.returnedAt != null) return done(next, effects)

  const awayRecord = { id: newId('a'), start: p.idleSince, end: Math.max(p.idleSince, now) }
  next = { ...next, away: [...next.away, awayRecord] }
  const { onReturn, autoResumeMaxAwayMin } = next.settings
  const awayMs = now - p.idleSince
  const projectOk = next.projects.some((pr) => pr.id === p.projectId && !pr.archived)

  if (onReturn === 'auto' && awayMs <= autoResumeMaxAwayMin * MIN && projectOk) {
    const notice: AutoResumeNotice = { projectId: p.projectId, taskId: p.taskId, awayStart: p.idleSince, returnedAt: now }
    next = {
      ...next,
      pendingResume: null,
      paused: null,
      active: { projectId: p.projectId, taskId: p.taskId, startedAt: now },
      autoResumed: notice,
    }
    effects.push({ type: 'auto', notice })
    return done(next, effects)
  }

  const pending: PendingResume = { ...p, returnedAt: now, reason: onReturn === 'auto' && awayMs > autoResumeMaxAwayMin * MIN ? 'too-long' : 'ask' }
  next = { ...next, pendingResume: pending }
  effects.push({ type: 'ask', pending })
  return done(next, effects)
}

/** Heartbeat alarm, every minute. */
export function heartbeat(s: State, now: number): Step {
  const r = reconcile(s, now)
  return { state: { ...r.state, lastSeen: now }, effects: r.effects }
}

/**
 * Browser started. A timer still marked active was running when the browser
 * closed (or crashed): close it at lastSeen and set pendingResume. The caller
 * then applies the return behaviour if the user is active.
 */
export function startup(s: State, now: number): Step {
  const effects: Effect[] = []
  let next: State = { ...s, autoResumed: null }
  // A prompt left unanswered in a previous session is stale.
  if (next.pendingResume?.returnedAt != null) next = { ...next, pendingResume: null }
  if (next.active) {
    const at = Math.min(now, next.lastSeen ?? next.active.startedAt)
    const r = goneAt(next, at)
    next = r.state
    effects.push(...r.effects)
  }
  next = prune(next, now)
  return done({ ...next, lastSeen: now }, effects)
}

export function resolveReturn(s: State, choice: ReturnChoice, now: number): Step {
  const p = s.pendingResume
  if (!p) return done(s)
  if (choice.action === 'resume') return begin(s, { projectId: p.projectId, taskId: p.taskId }, now, 'stop')
  if (choice.action === 'switch') return begin(s, choice, now, 'stop')
  return done({ ...s, pendingResume: null, lastSeen: now }, [{ type: 'clear-return' }])
}

export function dismissAutoResumeNotice(s: State): Step {
  if (!s.autoResumed) return done(s)
  return done({ ...s, autoResumed: null }, [{ type: 'clear-auto' }])
}

/* ------------------------------------------------------------- retention */

export function prune(s: State, now: number): State {
  const cutoff = now - RETENTION_DAYS * DAY
  if (!s.entries.some((e) => e.end < cutoff) && !s.away.some((a) => a.end < cutoff)) return s
  return { ...s, entries: s.entries.filter((e) => e.end >= cutoff), away: s.away.filter((a) => a.end >= cutoff) }
}

/** Entries that will be deleted within `days` days. */
export function expiringSoon(s: State, now: number, days = 14): Entry[] {
  const cutoff = now - (RETENTION_DAYS - days) * DAY
  return s.entries.filter((e) => e.end < cutoff)
}

/* ---------------------------------------------------- entries & projects */

export function addEntry(s: State, input: Pick<Entry, 'projectId' | 'taskId' | 'start' | 'end'>): { state: State; entry: Entry } {
  const entry: Entry = { ...input, id: newId('e'), source: 'manual', endedBy: 'manual' }
  return { state: { ...s, entries: [...s.entries, entry] }, entry }
}

export function updateEntry(s: State, id: string, patch: Partial<Pick<Entry, 'projectId' | 'taskId' | 'start' | 'end'>>): State {
  return { ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) }
}

export function deleteEntry(s: State, id: string): { state: State; removed: Entry | undefined } {
  return { state: { ...s, entries: s.entries.filter((e) => e.id !== id) }, removed: s.entries.find((e) => e.id === id) }
}

export function restoreEntry(s: State, entry: Entry): State {
  return s.entries.some((e) => e.id === entry.id) ? s : { ...s, entries: [...s.entries, entry] }
}

export function addProject(s: State, input: { name: string; color: ProjectColor }, now: number): { state: State; project: Project } {
  const project: Project = { id: newId('p'), name: input.name.trim(), color: input.color, archived: false, createdAt: now }
  return { state: { ...s, projects: [...s.projects, project] }, project }
}

export function updateProject(s: State, id: string, patch: Partial<Pick<Project, 'name' | 'color' | 'archived'>>, now: number): Step {
  let next: State = { ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
  if (patch.archived) {
    if (next.active?.projectId === id) next = closeActive(next, now, 'stop')
    if (next.paused?.projectId === id) next = { ...next, paused: null }
  }
  return done(next)
}

export function addTask(s: State, projectId: string, name: string): { state: State; task: Task } {
  const task: Task = { id: newId('t'), projectId, name: name.trim(), archived: false }
  return { state: { ...s, tasks: [...s.tasks, task] }, task }
}

export function updateTask(s: State, id: string, patch: Partial<Pick<Task, 'name' | 'archived'>>): State {
  return { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
}

export function updateSettings(s: State, patch: Partial<Settings>): Step {
  const settings: Settings = { ...s.settings, ...patch }
  settings.idleThresholdSec = clampThreshold(settings.idleThresholdSec)
  const effects: Effect[] = settings.idleThresholdSec !== s.settings.idleThresholdSec ? [{ type: 'idle-interval', seconds: settings.idleThresholdSec }] : []
  return done({ ...s, settings }, effects)
}

export function completeOnboarding(
  s: State,
  input: { projects: { name: string; color: ProjectColor }[]; settings: Partial<Settings> },
  now: number,
): Step {
  const created = input.projects
    .filter((p) => p.name.trim())
    .map((p) => ({ id: newId('p'), name: p.name.trim(), color: p.color, archived: false, createdAt: now }))
  const r = updateSettings({ ...s, onboarded: true, projects: [...s.projects, ...created] }, input.settings)
  return r
}

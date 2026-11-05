/**
 * In-memory implementation of WherewentStore. No persistence, no network.
 * Behaviour mirrors what the chrome.storage version must do, so the prototype
 * exercises the real rules (idle stop, ask vs auto-resume, retention).
 */
import type { ExportFormat, ReturnChoice, TaskRef, WherewentStore } from '../store'
import { DEFAULT_SETTINGS, RETENTION_DAYS, type Entry, type EntryEnd, type State, type Task } from '../types'
import { DAY, MIN, decimalHours, toDateInput, toTimeInput } from '../lib/time'

let counter = 0
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`

export function emptyState(): State {
  return {
    onboarded: false,
    projects: [],
    tasks: [],
    entries: [],
    away: [],
    session: null,
    idle: null,
    settings: { ...DEFAULT_SETTINGS },
    pendingReturn: null,
    autoResumed: null,
  }
}

function prune(s: State, now: number): State {
  const cutoff = now - RETENTION_DAYS * DAY
  if (!s.entries.some((e) => e.end < cutoff) && !s.away.some((a) => a.end < cutoff)) return s
  return { ...s, entries: s.entries.filter((e) => e.end >= cutoff), away: s.away.filter((a) => a.end >= cutoff) }
}

export interface MockStore extends WherewentStore {
  /** Prototype only: replace the whole state (used by the screen switcher). */
  replaceState(next: State): void
}

export function createMockStore(initial: State = emptyState(), clock: () => number = Date.now): MockStore {
  let state = prune(initial, clock())
  const listeners = new Set<() => void>()

  const commit = (next: State) => {
    state = next
    listeners.forEach((l) => l())
  }
  const done = () => Promise.resolve()

  const resolveTask = (s: State, ref: TaskRef): { state: State; taskId: string | null } => {
    if (ref.taskId !== undefined && ref.taskId !== null) return { state: s, taskId: ref.taskId }
    const name = ref.taskName?.trim()
    if (!name) return { state: s, taskId: null }
    const existing = s.tasks.find((t) => t.projectId === ref.projectId && t.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      return existing.archived
        ? { state: { ...s, tasks: s.tasks.map((t) => (t.id === existing.id ? { ...t, archived: false } : t)) }, taskId: existing.id }
        : { state: s, taskId: existing.id }
    }
    const task: Task = { id: uid('t'), projectId: ref.projectId, name, archived: false }
    return { state: { ...s, tasks: [...s.tasks, task] }, taskId: task.id }
  }

  /** Close the live segment (if any) into an entry. */
  const closeSegment = (s: State, at: number, endedBy: EntryEnd): State => {
    const sess = s.session
    if (!sess?.runningSince) return s
    const entry: Entry = {
      id: uid('e'),
      projectId: sess.projectId,
      taskId: sess.taskId,
      start: sess.runningSince,
      end: Math.max(at, sess.runningSince),
      source: 'timer',
      endedBy,
    }
    const keep = entry.end - entry.start >= 1000
    return {
      ...s,
      entries: keep ? [...s.entries, entry] : s.entries,
      session: { ...sess, accumulatedMs: sess.accumulatedMs + (entry.end - entry.start), runningSince: null },
    }
  }

  const begin = (s: State, ref: TaskRef, at: number): State => {
    const r = resolveTask(s, ref)
    return {
      ...r.state,
      session: { projectId: ref.projectId, taskId: r.taskId, startedAt: at, accumulatedMs: 0, runningSince: at },
      pendingReturn: null,
      autoResumed: null,
    }
  }

  const store: MockStore = {
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    replaceState: (next) => commit(prune(next, clock())),

    start(ref) {
      const now = clock()
      commit(begin(closeSegment(state, now, 'stop'), ref, now))
      return done()
    },
    pause() {
      commit(closeSegment(state, clock(), 'pause'))
      return done()
    },
    resume() {
      if (state.session && !state.session.runningSince) {
        commit({ ...state, session: { ...state.session, runningSince: clock() } })
      }
      return done()
    },
    stop() {
      commit({ ...closeSegment(state, clock(), 'stop'), session: null })
      return done()
    },
    switchTo(ref) {
      const now = clock()
      commit(begin(closeSegment(state, now, 'switch'), ref, now))
      return done()
    },

    goIdle(lastActiveAt) {
      if (state.idle) return done()
      const sess = state.session
      const wasRunning = !!sess?.runningSince
      let next = closeSegment(state, lastActiveAt, 'idle')
      next = {
        ...next,
        session: wasRunning ? null : next.session,
        idle: { since: lastActiveAt, previous: wasRunning && sess ? { projectId: sess.projectId, taskId: sess.taskId } : null },
        autoResumed: null,
      }
      commit(next)
      return done()
    },
    returnFromIdle(at) {
      const idle = state.idle
      if (!idle) return done()
      let next: State = {
        ...state,
        idle: null,
        away: [...state.away, { id: uid('a'), start: idle.since, end: at }],
      }
      if (idle.previous) {
        const awayMin = (at - idle.since) / MIN
        const { onReturn, autoResumeMaxAwayMin } = state.settings
        if (onReturn === 'auto' && awayMin <= autoResumeMaxAwayMin) {
          next = begin(next, idle.previous, at)
          next = { ...next, autoResumed: { awayStart: idle.since, returnedAt: at, ...idle.previous } }
        } else {
          next = {
            ...next,
            pendingReturn: {
              awayStart: idle.since,
              returnedAt: at,
              previous: idle.previous,
              reason: onReturn === 'auto' ? 'too-long' : 'ask',
            },
          }
        }
      }
      commit(next)
      return done()
    },
    resolveReturn(choice: ReturnChoice) {
      const pr = state.pendingReturn
      if (!pr) return done()
      const now = clock()
      if (choice.action === 'resume') commit(begin(state, pr.previous, now))
      else if (choice.action === 'switch') commit(begin(state, choice, now))
      else commit({ ...state, pendingReturn: null })
      return done()
    },
    dismissAutoResumeNotice() {
      commit({ ...state, autoResumed: null })
      return done()
    },

    addEntry(input) {
      const entry: Entry = { ...input, id: uid('e'), source: 'manual', endedBy: 'manual' }
      commit({ ...state, entries: [...state.entries, entry] })
      return Promise.resolve(entry)
    },
    updateEntry(id, patch) {
      commit({ ...state, entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
      return done()
    },
    deleteEntry(id) {
      const removed = state.entries.find((e) => e.id === id)
      commit({ ...state, entries: state.entries.filter((e) => e.id !== id) })
      return Promise.resolve(removed)
    },
    restoreEntry(entry) {
      if (!state.entries.some((e) => e.id === entry.id)) commit({ ...state, entries: [...state.entries, entry] })
      return done()
    },

    addProject({ name, color }) {
      const project = { id: uid('p'), name: name.trim(), color, archived: false, createdAt: clock() }
      commit({ ...state, projects: [...state.projects, project] })
      return Promise.resolve(project)
    },
    updateProject(id, patch) {
      let next: State = { ...state, projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
      if (patch.archived && next.session?.projectId === id) next = { ...closeSegment(next, clock(), 'stop'), session: null }
      commit(next)
      return done()
    },
    addTask(projectId, name) {
      const task: Task = { id: uid('t'), projectId, name: name.trim(), archived: false }
      commit({ ...state, tasks: [...state.tasks, task] })
      return Promise.resolve(task)
    },
    updateTask(id, patch) {
      commit({ ...state, tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
      return done()
    },

    updateSettings(patch) {
      commit({ ...state, settings: { ...state.settings, ...patch } })
      return done()
    },
    completeOnboarding({ projects, settings }) {
      const now = clock()
      const created = projects
        .filter((p) => p.name.trim())
        .map((p) => ({ id: uid('p'), name: p.name.trim(), color: p.color, archived: false, createdAt: now }))
      commit({
        ...state,
        onboarded: true,
        projects: [...state.projects, ...created],
        settings: { ...state.settings, ...settings },
      })
      return done()
    },

    exportData(format: ExportFormat) {
      const s = state
      if (format === 'json') {
        return Promise.resolve(
          JSON.stringify(
            {
              app: 'wherewent',
              version: 1,
              exportedAt: new Date(clock()).toISOString(),
              projects: s.projects,
              tasks: s.tasks,
              entries: [...s.entries].sort((a, b) => a.start - b.start),
              away: s.away,
              settings: s.settings,
            },
            null,
            2,
          ),
        )
      }
      const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
      const rows = [['date', 'start', 'end', 'duration_hours', 'project', 'task', 'source'].join(',')]
      for (const e of [...s.entries].sort((a, b) => a.start - b.start)) {
        const p = s.projects.find((x) => x.id === e.projectId)
        const t = s.tasks.find((x) => x.id === e.taskId)
        rows.push(
          [
            toDateInput(e.start),
            toTimeInput(e.start),
            toTimeInput(e.end),
            String(decimalHours(e.end - e.start)),
            esc(p?.name ?? ''),
            esc(t?.name ?? ''),
            e.source,
          ].join(','),
        )
      }
      return Promise.resolve(rows.join('\n'))
    },
  }
  return store
}

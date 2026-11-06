import type { Entry, Project, State, Task } from '../types'

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

export function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addDays(t: number, n: number): number {
  const d = new Date(t)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** Monday-based week start. */
export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t))
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

/** "1:04:09" for clocks. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** "3h 12m", "45m", "0m". */
export function formatDuration(ms: number): string {
  if (ms > 0 && ms < 30_000) return '<1m'
  const totalMin = Math.max(0, Math.round(ms / MIN))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Decimal hours for exports: 1.25 */
export function decimalHours(ms: number): number {
  return Math.round((ms / HOUR) * 100) / 100
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const dayLongFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export const formatTime = (t: number) => timeFmt.format(t)
export const formatDay = (t: number) => dayFmt.format(t)
export const formatDayLong = (t: number) => dayLongFmt.format(t)
export const formatMonthDay = (t: number) => monthFmt.format(t)

/** "HH:MM" for <input type="time">. */
export function toTimeInput(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function toDateInput(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function fromDateTimeInputs(date: string, time: string): number {
  const [y, mo, da] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return new Date(y, mo - 1, da, h, mi, 0, 0).getTime()
}

/** Elapsed time of the running (or paused) timer, computed from timestamps only. */
export function timerElapsed(state: Pick<State, 'active' | 'paused'>, now: number): number {
  if (state.active) return Math.max(0, now - state.active.startedAt)
  if (state.paused) return Math.max(0, state.paused.pausedAt - state.paused.startedAt)
  return 0
}

/** Closed entries plus the live segment of the running timer. */
export function entriesWithLive(state: Pick<State, 'entries' | 'active'>, now: number): Entry[] {
  const a = state.active
  if (!a) return state.entries
  return [
    ...state.entries,
    { id: 'live', projectId: a.projectId, taskId: a.taskId, start: a.startedAt, end: Math.max(a.startedAt, now), source: 'timer', endedBy: 'stop' },
  ]
}

export function clippedDuration(e: Pick<Entry, 'start' | 'end'>, from: number, to: number): number {
  return Math.max(0, Math.min(e.end, to) - Math.max(e.start, from))
}

export function totalIn(entries: Entry[], from: number, to: number): number {
  return entries.reduce((sum, e) => sum + clippedDuration(e, from, to), 0)
}

export interface ProjectTotal {
  project: Project
  ms: number
}

export function totalsByProject(entries: Entry[], projects: Project[], from: number, to: number): ProjectTotal[] {
  const map = new Map<string, number>()
  for (const e of entries) {
    const d = clippedDuration(e, from, to)
    if (d > 0) map.set(e.projectId, (map.get(e.projectId) ?? 0) + d)
  }
  return projects
    .filter((p) => map.has(p.id))
    .map((p) => ({ project: p, ms: map.get(p.id)! }))
    .sort((a, b) => b.ms - a.ms)
}

export interface Pair {
  project: Project
  task: Task | null
}

/** Most recent distinct project/task pairs, newest first. */
export function recentPairs(state: Pick<State, 'entries' | 'projects' | 'tasks'>, limit = 3, exclude?: { projectId: string; taskId: string | null }): Pair[] {
  const seen = new Set<string>()
  const out: Pair[] = []
  const sorted = [...state.entries].sort((a, b) => b.end - a.end)
  for (const e of sorted) {
    const key = `${e.projectId}:${e.taskId ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    if (exclude && exclude.projectId === e.projectId && exclude.taskId === e.taskId) continue
    const project = state.projects.find((p) => p.id === e.projectId)
    if (!project || project.archived) continue
    const task = e.taskId ? (state.tasks.find((t) => t.id === e.taskId) ?? null) : null
    out.push({ project, task })
    if (out.length >= limit) break
  }
  return out
}

export function findProject(state: Pick<State, 'projects'>, id: string | null | undefined): Project | undefined {
  return id ? state.projects.find((p) => p.id === id) : undefined
}
export function findTask(state: Pick<State, 'tasks'>, id: string | null | undefined): Task | undefined {
  return id ? state.tasks.find((t) => t.id === id) : undefined
}

/** "2 min", "90 s", "15 s". */
export function formatThreshold(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`
}

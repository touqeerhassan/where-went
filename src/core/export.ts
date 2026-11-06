/** Complete exports. Entries are deleted after 6 months, so these are the only way to keep history. */
import { RETENTION_DAYS, type State } from '../types'

export type ExportFormat = 'csv' | 'json'

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const localTime = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const csvCell = (v: string | number | boolean) => {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const CSV_COLUMNS = [
  'entry_id',
  'date',
  'start_local',
  'end_local',
  'start_iso',
  'end_iso',
  'duration_minutes',
  'duration_hours',
  'project',
  'project_archived',
  'task',
  'source',
  'ended_by',
] as const

export function toCSV(s: State): string {
  const rows = [CSV_COLUMNS.join(',')]
  for (const e of [...s.entries].sort((a, b) => a.start - b.start)) {
    const p = s.projects.find((x) => x.id === e.projectId)
    const t = s.tasks.find((x) => x.id === e.taskId)
    const ms = e.end - e.start
    rows.push(
      [
        e.id,
        localDate(e.start),
        localTime(e.start),
        localTime(e.end),
        new Date(e.start).toISOString(),
        new Date(e.end).toISOString(),
        Math.round((ms / 60_000) * 100) / 100,
        Math.round((ms / 3_600_000) * 1000) / 1000,
        p?.name ?? '(deleted project)',
        p?.archived ?? false,
        t?.name ?? '',
        e.source,
        e.endedBy,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return rows.join('\r\n') + '\r\n'
}

export function toJSON(s: State, now: number): string {
  return JSON.stringify(
    {
      app: 'wherewent',
      format: 1,
      exportedAt: new Date(now).toISOString(),
      note: `Entries older than ${RETENTION_DAYS} days are deleted automatically inside the extension. This file is your copy.`,
      settings: s.settings,
      projects: s.projects,
      tasks: s.tasks,
      entries: [...s.entries].sort((a, b) => a.start - b.start),
      awayPeriods: [...s.away].sort((a, b) => a.start - b.start),
      runningTimer: s.active,
    },
    null,
    2,
  )
}

export function exportData(s: State, format: ExportFormat, now: number): string {
  return format === 'csv' ? toCSV(s) : toJSON(s, now)
}

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CaretLeftIcon,
  CaretRightIcon,
  ChartBarIcon,
  DownloadSimpleIcon,
  FolderSimpleIcon,
  GearSixIcon,
  ListBulletsIcon,
} from '@phosphor-icons/react'
import { useWherewent } from '../../store'
import type { Entry } from '../../types'
import {
  entriesWithLive,
  findProject,
  findTask,
  formatClock,
  formatDuration,
  sessionElapsed,
  startOfDay,
  toDateInput,
  totalIn,
  clippedDuration,
} from '../../lib/time'
import { useNow } from '../hooks'
import { Button, IconButton, ProjectDot, Segmented, Wordmark, cx } from '../ui'
import { computeRange, shiftAnchor, type RangeKind } from './range'
import { Card, DayTimeline, ProjectBars, TotalsColumns } from './Charts'
import { EntriesTable } from './EntriesView'
import { ProjectsView } from './ProjectsView'
import { SettingsView } from './SettingsView'

export type DashboardView = 'overview' | 'entries' | 'projects' | 'settings'

const NAV: { id: DashboardView; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <ChartBarIcon size={16} /> },
  { id: 'entries', label: 'Entries', icon: <ListBulletsIcon size={16} /> },
  { id: 'projects', label: 'Projects & tasks', icon: <FolderSimpleIcon size={16} /> },
  { id: 'settings', label: 'Settings', icon: <GearSixIcon size={16} /> },
]

const RANGES = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
  { value: '6m' as const, label: '6 Months' },
]

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface DashboardProps {
  initialView?: DashboardView
  initialRange?: RangeKind
  /** Static render for the landing page. */
  frozenAt?: number
}

/** Full-tab dashboard. */
export function Dashboard({ initialView = 'overview', initialRange = 'week', frozenAt }: DashboardProps) {
  const [state, store] = useWherewent()
  const live = useNow(frozenAt === undefined, 15_000)
  const now = frozenAt ?? live
  const [view, setView] = useState<DashboardView>(initialView)
  const [rangeKind, setRangeKind] = useState<RangeKind>(initialRange)
  const [anchor, setAnchor] = useState(now)
  const [toast, setToast] = useState<{ entry: Entry } | null>(null)
  const mainRef = useRef<HTMLHeadingElement>(null)
  const prevView = useRef(initialView)

  useEffect(() => setView(initialView), [initialView])
  useEffect(() => {
    if (prevView.current === view) return
    prevView.current = view
    mainRef.current?.focus()
  }, [view])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const range = useMemo(() => computeRange(rangeKind, anchor, now), [rangeKind, anchor, now])
  const entries = useMemo(() => entriesWithLive(state, now), [state, now])
  const isCurrent = range.to > now
  const tracked = totalIn(entries, range.from, range.to)
  const awayMs = state.away.reduce((s, a) => s + clippedDuration(a, range.from, range.to), 0)
  const daysWithTime = new Set(entries.filter((e) => e.end > range.from && e.start < range.to).map((e) => startOfDay(e.start))).size

  const doExport = async (f: 'csv' | 'json') => {
    const data = await store.exportData(f)
    download(`wherewent-${toDateInput(now)}.${f}`, data, f === 'csv' ? 'text/csv' : 'application/json')
  }

  const session = state.session
  const sp = findProject(state, session?.projectId)
  const st = findTask(state, session?.taskId)
  const showRange = view === 'overview' || view === 'entries'

  return (
    // Layout follows the dashboard's own width (container queries), not the viewport.
    <div className="@container flex min-h-full flex-col">
    <div className="ww-dashboard grid flex-1 grid-cols-1 bg-bg text-ink @3xl:grid-cols-[13.5rem_minmax(0,1fr)]">
      <aside className="flex flex-col border-b border-line bg-surface @3xl:border-r @3xl:border-b-0">
        <div className="flex h-14 items-center px-4">
          <Wordmark />
        </div>
        <nav aria-label="Dashboard" className="px-2 pb-2 @3xl:pb-0">
          <ul className="flex gap-1 overflow-x-auto @3xl:flex-col">
            {NAV.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  aria-current={view === n.id ? 'page' : undefined}
                  onClick={() => setView(n.id)}
                  className={cx(
                    'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] whitespace-nowrap transition-colors duration-150',
                    view === n.id ? 'bg-primary-soft font-semibold text-primary-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <span aria-hidden="true">{n.icon}</span>
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto hidden p-3 @3xl:block">
          {session && sp ? (
            <div className="rounded-md border border-line bg-bg p-2.5" aria-label="Current timer" role="group">
              <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.08em] text-primary-ink uppercase">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {session.runningSince ? 'Tracking' : 'Paused'}
              </p>
              <p className="tnum mt-1 text-lg font-semibold">{formatClock(sessionElapsed(session, now))}</p>
              <p className="flex items-center gap-1.5 truncate text-[12px] text-ink-2">
                <ProjectDot color={sp.color} size={7} />
                <span className="truncate">
                  {sp.name}
                  {st ? ` / ${st.name}` : ''}
                </span>
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-ink-3">No timer running.</p>
          )}
          <p className="mt-3 text-2xs leading-relaxed text-ink-3">Stored on this device only.</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2 @3xl:px-6">
          <h1 ref={mainRef} tabIndex={-1} className="mr-auto text-base font-semibold">
            {NAV.find((n) => n.id === view)?.label}
          </h1>
          {showRange && (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented name="range" label="Range" value={rangeKind} options={RANGES} onChange={(v) => setRangeKind(v)} />
              <div className="flex items-center">
                <IconButton label="Previous period" onClick={() => setAnchor(shiftAnchor(rangeKind, anchor, -1))}>
                  <CaretLeftIcon size={14} />
                </IconButton>
                <p className="tnum min-w-[9.5rem] text-center text-[13px] font-medium" aria-live="polite">
                  {range.label}
                </p>
                <IconButton label="Next period" disabled={isCurrent} onClick={() => setAnchor(shiftAnchor(rangeKind, anchor, 1))}>
                  <CaretRightIcon size={14} />
                </IconButton>
              </div>
            </div>
          )}
          <div className="flex items-center gap-1" role="group" aria-label="Export all data">
            <span className="mr-1 hidden text-[12px] text-ink-3 @5xl:inline">Export</span>
            <Button size="sm" onClick={() => doExport('csv')}>
              <DownloadSimpleIcon size={14} aria-hidden="true" /> CSV
            </Button>
            <Button size="sm" onClick={() => doExport('json')}>
              <DownloadSimpleIcon size={14} aria-hidden="true" /> JSON
            </Button>
          </div>
        </header>

        <main className="flex flex-col gap-4 p-4 @3xl:p-6">
          {view === 'overview' && (
            <>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line @5xl:grid-cols-4">
                <Stat label="Tracked" value={formatDuration(tracked)} />
                <Stat label={rangeKind === 'day' ? 'Projects' : 'Daily average'} value={rangeKind === 'day' ? String(new Set(entries.filter((e) => e.end > range.from && e.start < range.to).map((e) => e.projectId)).size) : formatDuration(daysWithTime ? tracked / daysWithTime : 0)} />
                <Stat label="Away, not tracked" value={formatDuration(awayMs)} away />
                <Stat label="Days tracked" value={String(daysWithTime)} />
              </dl>
              <div className={cx('grid gap-4', rangeKind !== 'day' && '@7xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
                <Card title="Time per project">
                  <ProjectBars entries={entries} projects={state.projects} range={range} />
                </Card>
                {rangeKind !== 'day' && (
                  <Card title={rangeKind === '6m' ? 'Weekly totals' : 'Daily totals'}>
                    <TotalsColumns entries={entries} projects={state.projects} range={range} />
                  </Card>
                )}
              </div>
              <DayTimeline state={state} entries={entries} initialDay={Math.min(isCurrent ? now : range.to - 1, now)} now={now} />
            </>
          )}
          {view === 'entries' && <EntriesTable state={state} range={range} now={now} onDeleted={(entry) => setToast({ entry })} />}
          {view === 'projects' && <ProjectsView state={state} now={now} />}
          {view === 'settings' && <SettingsView state={state} onExport={doExport} />}
        </main>
      </div>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast && (
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line-strong bg-ink px-4 py-2.5 text-[13px] text-bg shadow-window">
            Entry deleted.
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => {
                store.restoreEntry(toast.entry)
                setToast(null)
              }}
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
    </div>
  )
}

function Stat({ label, value, away }: { label: string; value: string; away?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="flex items-center gap-1.5 text-[12px] text-ink-2">
        {away && <span className="hatch-away inline-block h-2.5 w-4 rounded-[2px]" aria-hidden="true" />}
        {label}
      </dt>
      <dd className={cx('tnum mt-0.5 text-2xl font-semibold tracking-[-0.01em]', away && 'text-away')}>{value}</dd>
    </div>
  )
}

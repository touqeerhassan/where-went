import { useMemo, useState } from 'react'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import type { Entry, Project, State } from '../../types'
import {
  DAY,
  HOUR,
  addDays,
  clippedDuration,
  findTask,
  formatDayLong,
  formatDuration,
  formatTime,
  startOfDay,
  totalsByProject,
} from '../../lib/time'
import { IconButton, ProjectDot, cx, projectColorVar } from '../ui'
import type { Range } from './range'

export function Card({ title, actions, children, className, id }: { title: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  const hid = `${id ?? title.replace(/\W+/g, '-').toLowerCase()}-h`
  return (
    <section aria-labelledby={hid} className={cx('rounded-lg border border-line bg-surface', className)}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 id={hid} className="text-[13px] font-semibold">
          {title}
        </h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------ bars */

export function ProjectBars({ entries, projects, range }: { entries: Entry[]; projects: Project[]; range: Range }) {
  const totals = totalsByProject(entries, projects, range.from, range.to)
  const sum = totals.reduce((s, t) => s + t.ms, 0)
  const max = Math.max(...totals.map((t) => t.ms), 1)
  if (totals.length === 0) return <EmptyChart>No time tracked in this range.</EmptyChart>
  return (
    <ul className="flex flex-col gap-2.5">
      {totals.map(({ project, ms }) => (
        <li key={project.id} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.5rem_2.75rem] items-center gap-3">
          <span className="flex min-w-0 items-center gap-2 text-[13px]" title={project.name}>
            <ProjectDot color={project.color} />
            <span className="truncate">{project.name}</span>
          </span>
          <span className="h-3 overflow-hidden rounded-sm bg-surface-2" aria-hidden="true">
            <span className="block h-full rounded-sm" style={{ width: `${(ms / max) * 100}%`, background: projectColorVar(project.color) }} />
          </span>
          <span className="tnum text-right text-[13px] font-semibold">{formatDuration(ms)}</span>
          <span className="tnum text-right text-[12px] text-ink-3">{Math.round((ms / sum) * 100)}%</span>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------ totals columns */

export function TotalsColumns({ entries, projects, range }: { entries: Entry[]; projects: Project[]; range: Range }) {
  const data = useMemo(
    () =>
      range.buckets.map((b) => {
        const parts = totalsByProject(entries, projects, b.from, b.to)
        return { ...b, parts, total: parts.reduce((s, p) => s + p.ms, 0) }
      }),
    [entries, projects, range],
  )
  const max = Math.max(...data.map((d) => d.total), HOUR)
  const rawH = Math.ceil(max / HOUR)
  const step = rawH <= 4 ? 1 : rawH <= 8 ? 2 : rawH <= 16 ? 4 : rawH <= 40 ? 10 : 20
  const ceilH = Math.ceil(rawH / step) * step
  const ticks = Array.from({ length: ceilH / step + 1 }, (_, i) => i * step)
  const showEvery = data.length > 20 ? (range.kind === '6m' ? 4 : 3) : 1
  const peak = data.reduce((a, b) => (b.total > a.total ? b : a), data[0])

  return (
    <figure>
      <div className="relative flex h-40 gap-[3px] pl-8" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="tnum absolute left-0 w-full border-t border-line text-[10px] leading-none text-ink-3" style={{ bottom: `${(t / ceilH) * 100}%` }}>
            <span className="relative -top-1.5 bg-surface pr-1">{t}h</span>
          </span>
        ))}
        {data.map((d) => (
          <div key={d.from} className="relative z-10 flex min-w-0 flex-1 flex-col-reverse" title={`${d.label}: ${formatDuration(d.total)}`}>
            {d.parts.map((p) => (
              <span key={p.project.id} className="block w-full first:rounded-b-[2px] last:rounded-t-[2px]" style={{ height: `${(p.ms / (ceilH * HOUR)) * 100}%`, background: projectColorVar(p.project.color) }} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] pl-8" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.from} className="tnum min-w-0 flex-1 text-center text-[10px] text-ink-3">
            {i % showEvery === 0 ? d.short : ''}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        {peak && peak.total > 0 ? `Busiest: ${peak.label}, ${formatDuration(peak.total)}.` : 'No time tracked.'}
      </figcaption>
      <table className="sr-only">
        <caption>Tracked time per {range.kind === '6m' ? 'week' : 'day'}</caption>
        <thead>
          <tr>
            <th scope="col">{range.kind === '6m' ? 'Week' : 'Day'}</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.from}>
              <th scope="row">{d.label}</th>
              <td>{formatDuration(d.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/* ------------------------------------------------------- day timeline */

export function DayTimeline({ state, entries, initialDay, now }: { state: State; entries: Entry[]; initialDay: number; now: number }) {
  const [day, setDay] = useState(() => startOfDay(initialDay))
  const [prevInitial, setPrevInitial] = useState(initialDay)
  if (prevInitial !== initialDay) {
    setPrevInitial(initialDay)
    setDay(startOfDay(initialDay))
  }
  const dayEnd = day + DAY
  const blocks = entries.filter((e) => clippedDuration(e, day, dayEnd) > 0).sort((a, b) => a.start - b.start)
  const gaps = state.away.filter((a) => clippedDuration(a, day, dayEnd) > 0)
  const all = [...blocks, ...gaps]
  const firstH = all.length ? Math.floor((Math.min(...all.map((b) => Math.max(b.start, day))) - day) / HOUR) : 8
  const lastH = all.length ? Math.ceil((Math.max(...all.map((b) => Math.min(b.end, dayEnd))) - day) / HOUR) : 18
  const h0 = Math.max(0, Math.min(firstH, 8))
  const h1 = Math.min(24, Math.max(lastH, h0 + 8))
  const span = (h1 - h0) * HOUR
  const x = (t: number) => ((Math.max(day, Math.min(t, dayEnd)) - day - h0 * HOUR) / span) * 100
  const tracked = blocks.reduce((s, b) => s + clippedDuration(b, day, dayEnd), 0)
  const awayMs = gaps.reduce((s, g) => s + clippedDuration(g, day, dayEnd), 0)
  const isToday = day === startOfDay(now)
  const hours = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
  const hourLabel = (h: number) => formatTime(day + h * HOUR).replace(':00', '')

  return (
    <Card
      title="Day timeline"
      actions={
        <div className="flex items-center gap-1">
          <IconButton label="Previous day" onClick={() => setDay(startOfDay(addDays(day, -1)))}>
            <CaretLeftIcon size={14} />
          </IconButton>
          <p className="min-w-[11rem] text-center text-[13px] font-medium" aria-live="polite">
            {isToday ? 'Today' : formatDayLong(day)}
          </p>
          <IconButton label="Next day" disabled={isToday} onClick={() => setDay(startOfDay(addDays(day, 1)))}>
            <CaretRightIcon size={14} />
          </IconButton>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-2">
        <span>
          Tracked <span className="tnum font-semibold text-ink">{formatDuration(tracked)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="hatch-away inline-block h-2.5 w-4 rounded-[2px]" aria-hidden="true" />
          Away, not tracked <span className="tnum font-semibold text-away">{formatDuration(awayMs)}</span>
        </span>
      </div>
      {blocks.length === 0 && gaps.length === 0 ? (
        <EmptyChart>Nothing tracked on this day.</EmptyChart>
      ) : (
        <>
          <div className="relative h-14 rounded-md border border-line bg-surface-2">
            {hours.map((h) => (
              <span key={h} className="absolute top-0 h-full border-l border-line" style={{ left: `${((h - h0) / (h1 - h0)) * 100}%` }} aria-hidden="true" />
            ))}
            <ol aria-label="Tracked blocks and away gaps, in order">
              {[...blocks.map((b) => ({ kind: 'entry' as const, b })), ...gaps.map((g) => ({ kind: 'away' as const, b: g }))]
                .sort((a, b) => a.b.start - b.b.start)
                .map((item) => {
                  const left = x(item.b.start)
                  const width = Math.max(0.4, x(item.b.end) - left)
                  const dur = formatDuration(clippedDuration(item.b, day, dayEnd))
                  const time = `${formatTime(item.b.start)} to ${formatTime(item.b.end)}`
                  if (item.kind === 'away') {
                    return (
                      <li
                        key={item.b.id}
                        tabIndex={0}
                        title={`Away ${dur}, not tracked (${time})`}
                        aria-label={`Away ${dur}, not tracked, ${time}`}
                        className="hatch-away absolute top-1.5 bottom-1.5 overflow-hidden rounded-[3px] ring-1 ring-away-line ring-inset"
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        {width > 4 && <span className="tnum absolute inset-x-0 bottom-0 truncate bg-away-soft/90 px-1 text-[10px] font-medium text-away">away {dur}</span>}
                      </li>
                    )
                  }
                  const e = item.b as Entry
                  const p = state.projects.find((pp) => pp.id === e.projectId)
                  const t = findTask(state, e.taskId)
                  return (
                    <li
                      key={e.id}
                      tabIndex={0}
                      title={`${p?.name}${t ? ` / ${t.name}` : ''}: ${dur} (${time})`}
                      aria-label={`${p?.name}${t ? `, ${t.name}` : ''}, ${dur}, ${time}${e.id === 'live' ? ', running' : ''}`}
                      className={cx('absolute top-1.5 bottom-1.5 overflow-hidden rounded-[3px]', e.id === 'live' && 'ring-2 ring-ink/30 ring-inset')}
                      style={{ left: `${left}%`, width: `${width}%`, background: p ? projectColorVar(p.color) : undefined }}
                    >
                      {width > 7 && <span className="tnum block truncate px-1.5 pt-1 text-[11px] font-medium text-[var(--ww-on-project)]">{dur}</span>}
                    </li>
                  )
                })}
            </ol>
          </div>
          <div className="relative mt-1 h-4" aria-hidden="true">
            {hours.map((h, i) =>
              i % (h1 - h0 > 12 ? 2 : 1) === 0 ? (
                <span key={h} className={cx('tnum absolute text-[10px] whitespace-nowrap text-ink-3', i === 0 ? '' : h === h1 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: `${((h - h0) / (h1 - h0)) * 100}%` }}>
                  {hourLabel(h)}
                </span>
              ) : null,
            )}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
            {totalsByProject(blocks, state.projects, day, dayEnd).map(({ project, ms }) => (
              <li key={project.id} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <ProjectDot color={project.color} />
                {project.name} <span className="tnum font-medium text-ink">{formatDuration(ms)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

export function EmptyChart({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-3">{children}</p>
}

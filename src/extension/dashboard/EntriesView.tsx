import { useId, useMemo, useRef, useState } from 'react'
import { CheckIcon, PencilSimpleIcon, PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react'
import { useWherewent } from '../../store'
import type { Entry, State } from '../../types'
import {
  HOUR,
  findProject,
  findTask,
  formatDay,
  formatDuration,
  formatTime,
  fromDateTimeInputs,
  startOfDay,
  toDateInput,
  toTimeInput,
} from '../../lib/time'
import { Button, IconButton, ProjectDot } from '../ui'
import type { Range } from './range'
import { EmptyChart } from './Charts'

const PAGE = 40

export function EntriesTable({ state, range, now, onDeleted }: { state: State; range: Range; now: number; onDeleted: (e: Entry) => void }) {
  const [, store] = useWherewent()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const addBtn = useRef<HTMLButtonElement>(null)

  const rows = useMemo(
    () => state.entries.filter((e) => e.end > range.from && e.start < range.to).sort((a, b) => b.start - a.start),
    [state.entries, range],
  )
  const visible = rows.slice(0, limit)
  const groups = useMemo(() => {
    const m = new Map<number, Entry[]>()
    for (const e of visible) {
      const d = startOfDay(e.start)
      m.set(d, [...(m.get(d) ?? []), e])
    }
    return [...m.entries()]
  }, [visible])
  const total = rows.reduce((s, e) => s + (e.end - e.start), 0)

  return (
    <section aria-labelledby="entries-h" className="rounded-lg border border-line bg-surface">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 id="entries-h" className="text-[13px] font-semibold">
          Entries{' '}
          <span className="tnum font-normal text-ink-3">
            {rows.length} · {formatDuration(total)}
          </span>
        </h2>
        <Button ref={addBtn} size="sm" variant="primary" onClick={() => setAdding(true)} disabled={adding}>
          <PlusIcon size={14} aria-hidden="true" /> Add manual entry
        </Button>
      </div>

      {adding && (
        <div className="border-b border-line bg-surface-2 px-4 py-3">
          <EntryForm
            state={state}
            initial={{ projectId: state.projects.find((p) => !p.archived)?.id ?? '', taskId: null, start: now - HOUR, end: now }}
            submitLabel="Add entry"
            onCancel={() => {
              setAdding(false)
              addBtn.current?.focus()
            }}
            onSubmit={async (v) => {
              await store.addEntry(v)
              setAdding(false)
              addBtn.current?.focus()
            }}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyChart>No entries in this range. Start a timer from the toolbar or add one manually.</EmptyChart>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-2xs font-semibold tracking-[0.06em] text-ink-3 uppercase">
                <th scope="col" className="w-36 px-4 py-2 font-semibold">
                  Time
                </th>
                <th scope="col" className="w-20 px-2 py-2 text-right font-semibold">
                  Duration
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Project
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  Task
                </th>
                <th scope="col" className="w-24 px-4 py-2 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            {groups.map(([day, list]) => (
              <tbody key={day} className="border-t border-line">
                <tr className="bg-surface-2/60">
                  <th scope="rowgroup" colSpan={5} className="px-4 py-1.5 text-left text-[12px] font-semibold text-ink-2">
                    {formatDay(day)}{' '}
                    <span className="tnum font-normal text-ink-3">· {formatDuration(list.reduce((s, e) => s + (e.end - e.start), 0))}</span>
                  </th>
                </tr>
                {list.map((e) =>
                  editing === e.id ? (
                    <tr key={e.id} className="border-t border-line bg-primary-soft/40">
                      <td colSpan={5} className="px-4 py-3">
                        <EntryForm
                          state={state}
                          initial={e}
                          submitLabel="Save"
                          onCancel={() => setEditing(null)}
                          onSubmit={async (v) => {
                            await store.updateEntry(e.id, v)
                            setEditing(null)
                          }}
                        />
                      </td>
                    </tr>
                  ) : (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      state={state}
                      onEdit={() => setEditing(e.id)}
                      onDelete={async () => {
                        const removed = await store.deleteEntry(e.id)
                        if (removed) onDeleted(removed)
                      }}
                    />
                  ),
                )}
              </tbody>
            ))}
          </table>
          {rows.length > limit && (
            <div className="border-t border-line px-4 py-2">
              <Button size="sm" variant="ghost" onClick={() => setLimit(limit + PAGE)}>
                Show <span className="tnum">{Math.min(PAGE, rows.length - limit)}</span> more
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function EntryRow({ entry: e, state, onEdit, onDelete }: { entry: Entry; state: State; onEdit: () => void; onDelete: () => void }) {
  const p = findProject(state, e.projectId)
  const t = findTask(state, e.taskId)
  const label = `${p?.name ?? 'entry'} ${formatTime(e.start)}`
  return (
    <tr className="group border-t border-line hover:bg-surface-2/50">
      <td className="tnum px-4 py-1.5 whitespace-nowrap text-ink-2">
        {formatTime(e.start)} – {formatTime(e.end)}
      </td>
      <td className="tnum px-2 py-1.5 text-right font-semibold">{formatDuration(e.end - e.start)}</td>
      <td className="px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          {p && <ProjectDot color={p.color} />}
          <span className="truncate">{p?.name}</span>
        </span>
      </td>
      <td className="px-2 py-1.5 text-ink-2">
        <span className="flex items-center gap-2">
          <span className="truncate">{t?.name ?? <span className="text-ink-3">No task</span>}</span>
          {e.source === 'manual' && <span className="rounded-sm border border-line px-1 text-2xs text-ink-3">manual</span>}
          {e.endedBy === 'idle' && (
            <span className="inline-flex items-center gap-1 text-2xs text-away" title="Stopped automatically when you went idle">
              <span className="hatch-away inline-block h-2 w-3 rounded-[2px]" aria-hidden="true" />
              idle stop
            </span>
          )}
        </span>
      </td>
      <td className="px-4 py-1 text-right whitespace-nowrap">
        <IconButton label={`Edit ${label}`} onClick={onEdit}>
          <PencilSimpleIcon size={15} />
        </IconButton>
        <IconButton label={`Delete ${label}`} onClick={onDelete} className="hover:text-danger">
          <TrashIcon size={15} />
        </IconButton>
      </td>
    </tr>
  )
}

type FormValue = Pick<Entry, 'projectId' | 'taskId' | 'start' | 'end'>

export function EntryForm({
  state,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  state: State
  initial: FormValue
  submitLabel: string
  onSubmit: (v: FormValue) => void
  onCancel: () => void
}) {
  const id = useId()
  const [date, setDate] = useState(toDateInput(initial.start))
  const [startT, setStartT] = useState(toTimeInput(initial.start))
  const [endT, setEndT] = useState(toTimeInput(initial.end))
  const [projectId, setProjectId] = useState(initial.projectId)
  const [taskId, setTaskId] = useState<string>(initial.taskId ?? '')
  const [error, setError] = useState<string | null>(null)
  const projects = state.projects.filter((p) => !p.archived || p.id === initial.projectId)
  const tasks = state.tasks.filter((t) => t.projectId === projectId && (!t.archived || t.id === initial.taskId))

  const field = 'h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px]'
  const lab = 'mb-1 block text-2xs font-medium text-ink-2'

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault()
        const start = fromDateTimeInputs(date, startT)
        let end = fromDateTimeInputs(date, endT)
        if (end <= start) end += 24 * HOUR // crosses midnight
        if (end - start > 16 * HOUR) {
          setError('Entry is longer than 16 hours. Check the start and end times.')
          return
        }
        if (!projectId) {
          setError('Choose a project.')
          return
        }
        onSubmit({ projectId, taskId: taskId || null, start, end })
      }}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault()
          onCancel()
        }
      }}
      className="flex flex-wrap items-end gap-2"
      aria-describedby={error ? `${id}-err` : undefined}
    >
      <div>
        <label htmlFor={`${id}-d`} className={lab}>
          Date
        </label>
        <input id={`${id}-d`} type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${field} tnum`} />
      </div>
      <div>
        <label htmlFor={`${id}-s`} className={lab}>
          Start
        </label>
        <input id={`${id}-s`} type="time" required value={startT} onChange={(e) => setStartT(e.target.value)} className={`${field} tnum`} autoFocus />
      </div>
      <div>
        <label htmlFor={`${id}-e`} className={lab}>
          End
        </label>
        <input id={`${id}-e`} type="time" required value={endT} onChange={(e) => setEndT(e.target.value)} className={`${field} tnum`} />
      </div>
      <div className="min-w-40 flex-1">
        <label htmlFor={`${id}-p`} className={lab}>
          Project
        </label>
        <select
          id={`${id}-p`}
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value)
            setTaskId('')
          }}
          className={`${field} w-full`}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-36 flex-1">
        <label htmlFor={`${id}-t`} className={lab}>
          Task
        </label>
        <select id={`${id}-t`} value={taskId} onChange={(e) => setTaskId(e.target.value)} className={`${field} w-full`}>
          <option value="">No task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" variant="primary">
          <CheckIcon size={14} aria-hidden="true" /> {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <XIcon size={14} aria-hidden="true" /> Cancel
        </Button>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="w-full text-[12px] text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

import { useId, useState } from 'react'
import { ArchiveIcon, ArrowCounterClockwiseIcon, PlusIcon } from '@phosphor-icons/react'
import { useWherewent } from '../../store'
import { PROJECT_COLORS, type Project, type ProjectColor, type State } from '../../types'
import { DAY, formatDuration, totalIn } from '../../lib/time'
import { Button, IconButton, cx, projectColorVar } from '../ui'

export function ProjectsView({ state, now }: { state: State; now: number }) {
  const [, store] = useWherewent()
  const active = state.projects.filter((p) => !p.archived)
  const archived = state.projects.filter((p) => p.archived)
  const [name, setName] = useState('')
  const id = useId()
  const nextColor = PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length]

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          store.addProject({ name, color: nextColor })
          setName('')
        }}
      >
        <div className="min-w-56 flex-1">
          <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-ink-2">
            New project
          </label>
          <input
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client or product name"
            className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm placeholder:text-ink-3"
          />
        </div>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          <PlusIcon size={16} aria-hidden="true" /> Add project
        </Button>
      </form>

      <ul className="grid gap-3 @5xl:grid-cols-2">
        {active.map((p) => (
          <li key={p.id}>
            <ProjectCard project={p} state={state} now={now} />
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <details className="rounded-lg border border-line bg-surface">
          <summary className="flex h-11 items-center px-4 text-[13px] font-semibold">
            Archived <span className="tnum ml-1.5 font-normal text-ink-3">{archived.length}</span>
          </summary>
          <ul className="border-t border-line">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0">
                <span className="size-2.5 rounded-full opacity-60" style={{ background: projectColorVar(p.color) }} aria-hidden="true" />
                <span className="flex-1 text-[13px] text-ink-2">{p.name}</span>
                <Button size="sm" variant="ghost" onClick={() => store.updateProject(p.id, { archived: false })}>
                  <ArrowCounterClockwiseIcon size={14} aria-hidden="true" /> Unarchive
                </Button>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3">Archived projects keep their history and stay in reports and exports.</p>
        </details>
      )}
    </div>
  )
}

function ProjectCard({ project: p, state, now }: { project: Project; state: State; now: number }) {
  const [, store] = useWherewent()
  const [name, setName] = useState(p.name)
  const [newTask, setNewTask] = useState('')
  const [showArchivedTasks, setShowArchivedTasks] = useState(false)
  const uid = useId()
  const tasks = state.tasks.filter((t) => t.projectId === p.id)
  const activeTasks = tasks.filter((t) => !t.archived)
  const archivedTasks = tasks.filter((t) => t.archived)
  const entries = state.entries.filter((e) => e.projectId === p.id)
  const last30 = totalIn(entries, now - 30 * DAY, now)

  return (
    <article className="rounded-lg border border-line bg-surface" aria-labelledby={`${uid}-n`}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="size-3 shrink-0 rounded-full" style={{ background: projectColorVar(p.color) }} aria-hidden="true" />
        <h3 id={`${uid}-n`} className="sr-only">
          {p.name}
        </h3>
        <label htmlFor={`${uid}-name`} className="sr-only">
          Project name
        </label>
        <input
          id={`${uid}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== p.name && store.updateProject(p.id, { name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm font-semibold hover:border-line focus:border-line-strong"
        />
        <span className="tnum shrink-0 text-[12px] text-ink-3" title="Tracked in the last 30 days">
          {formatDuration(last30)} <span className="sr-only">in the last 30 days</span>
          <span aria-hidden="true"> / 30d</span>
        </span>
        <IconButton label={`Archive ${p.name}`} onClick={() => store.updateProject(p.id, { archived: true })}>
          <ArchiveIcon size={16} />
        </IconButton>
      </div>

      <div className="px-4 py-3">
        <ColorPicker name={`${uid}-color`} value={p.color} onChange={(color) => store.updateProject(p.id, { color })} />

        <h4 className="mt-3 mb-1.5 text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">Tasks</h4>
        <ul className="flex flex-col">
          {activeTasks.map((t) => (
            <li key={t.id} className="group flex h-8 items-center gap-2 rounded-md px-1.5 hover:bg-surface-2">
              <span className="flex-1 truncate text-[13px]">{t.name}</span>
              <IconButton label={`Archive task ${t.name}`} className="size-7" onClick={() => store.updateTask(t.id, { archived: true })}>
                <ArchiveIcon size={14} />
              </IconButton>
            </li>
          ))}
          {activeTasks.length === 0 && <li className="px-1.5 text-[12px] text-ink-3">No tasks. Tasks typed in the popup appear here.</li>}
        </ul>
        <form
          className="mt-1.5 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newTask.trim()) return
            store.addTask(p.id, newTask)
            setNewTask('')
          }}
        >
          <label htmlFor={`${uid}-task`} className="sr-only">
            New task for {p.name}
          </label>
          <input
            id={`${uid}-task`}
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add a task"
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-[13px] placeholder:text-ink-3"
          />
          <Button type="submit" size="sm" disabled={!newTask.trim()}>
            Add
          </Button>
        </form>
        {archivedTasks.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              aria-expanded={showArchivedTasks}
              onClick={() => setShowArchivedTasks((v) => !v)}
              className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
            >
              {showArchivedTasks ? 'Hide' : 'Show'} <span className="tnum">{archivedTasks.length}</span> archived
            </button>
            {showArchivedTasks && (
              <ul className="mt-1">
                {archivedTasks.map((t) => (
                  <li key={t.id} className="flex h-8 items-center gap-2 px-1.5">
                    <span className="flex-1 truncate text-[13px] text-ink-3 line-through">{t.name}</span>
                    <IconButton label={`Unarchive task ${t.name}`} className="size-7" onClick={() => store.updateTask(t.id, { archived: false })}>
                      <ArrowCounterClockwiseIcon size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export function ColorPicker({ name, value, onChange }: { name: string; value: ProjectColor; onChange: (c: ProjectColor) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">Color</legend>
      <div className="flex flex-wrap gap-1.5">
        {PROJECT_COLORS.map((c) => (
          <label
            key={c}
            title={c}
            className={cx(
              'relative inline-flex size-7 items-center justify-center rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
              value === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
            )}
          >
            <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} className="sr-only" aria-label={c} />
            <span className="size-5 rounded-full" style={{ background: projectColorVar(c) }} aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  )
}

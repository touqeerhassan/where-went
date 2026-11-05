import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react'
import {
  ArrowClockwiseIcon,
  ArrowsLeftRightIcon,
  CaretDownIcon,
  ChartBarIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useWherewent } from '../store'
import type { Project, State } from '../types'
import {
  entriesWithLive,
  findProject,
  findTask,
  formatClock,
  formatDuration,
  formatTime,
  recentPairs,
  sessionElapsed,
  startOfDay,
  totalIn,
  totalsByProject,
  DAY,
  type Pair,
} from '../lib/time'
import { useNow } from './hooks'
import { Button, Eyebrow, IconButton, ProjectDot, Wordmark, cx, projectColorVar } from './ui'
import { Onboarding } from './Onboarding'
import { PROJECT_COLORS } from '../types'

export interface PopupProps {
  onOpenDashboard?: () => void
  /** Landing demos render a static, non-ticking popup. */
  frozenAt?: number
}

/** The toolbar popup: 380 x 560. */
export function Popup({ onOpenDashboard, frozenAt }: PopupProps) {
  const [state] = useWherewent()
  const ticking = frozenAt === undefined && !!state.session?.runningSince
  const live = useNow(ticking)
  const now = frozenAt ?? live
  const dayStart = startOfDay(now)
  const todayMs = totalIn(entriesWithLive(state, now), dayStart, dayStart + DAY)

  return (
    <div className="ww-popup flex h-[560px] w-[380px] flex-col overflow-hidden bg-bg text-ink">
      {state.onboarded ? (
        <>
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-3">
            <Wordmark />
            <div className="flex items-center gap-1">
              <p className="mr-1 text-[12px] text-ink-3">
                Today <span className="tnum font-semibold text-ink">{formatDuration(todayMs)}</span>
              </p>
              <IconButton label="Open dashboard" onClick={onOpenDashboard}>
                <ChartBarIcon size={18} />
              </IconButton>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">
            {state.session ? <RunningView state={state} now={now} /> : <IdleView state={state} />}
          </main>
          <footer className="flex h-8 shrink-0 items-center justify-between border-t border-line px-3 text-2xs text-ink-3">
            <span>
              Stops after <span className="tnum">{state.settings.idleThresholdMin}</span> min idle ·{' '}
              {state.settings.onReturn === 'ask' ? 'Asks on return' : 'Auto-resumes'}
            </span>
            <span>Stored on this device</span>
          </footer>
        </>
      ) : (
        <Onboarding />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ idle */

function IdleView({ state }: { state: State }) {
  const [, store] = useWherewent()
  const active = state.projects.filter((p) => !p.archived)
  const recents = useMemo(() => recentPairs(state, 3), [state])
  const [projectId, setProjectId] = useState<string>(() => recents[0]?.project.id ?? active[0]?.id ?? '')
  const [task, setTask] = useState('')
  const taskId = useId()
  const listId = useId()
  const tasks = state.tasks.filter((t) => t.projectId === projectId && !t.archived)
  const project = findProject(state, projectId)

  useEffect(() => {
    if (!project && active[0]) setProjectId(active[0].id)
  }, [project, active])

  if (active.length === 0) return <NoProjects />

  const start = () => project && store.start({ projectId, taskName: task })

  return (
    <div className="flex flex-col gap-4 p-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          start()
        }}
      >
        <fieldset>
          <legend className="mb-1.5 text-[12px] font-medium text-ink-2">Project</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {active.map((p) => (
              <label
                key={p.id}
                title={p.name}
                className={cx(
                  'flex h-9 min-w-0 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring',
                  p.id === projectId
                    ? 'border-primary bg-primary-soft font-medium text-ink'
                    : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                )}
              >
                <input
                  type="radio"
                  name="project"
                  value={p.id}
                  checked={p.id === projectId}
                  onChange={() => setProjectId(p.id)}
                  className="sr-only"
                />
                <ProjectDot color={p.color} />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={taskId} className="mb-1.5 block text-[12px] font-medium text-ink-2">
            Task <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input
            id={taskId}
            list={listId}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder={tasks[0] ? `e.g. ${tasks[0].name}` : 'Type a task'}
            autoComplete="off"
            className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink placeholder:text-ink-3"
          />
          <datalist id={listId}>
            {tasks.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!project}>
          <PlayIcon size={18} weight="fill" aria-hidden="true" />
          Start
          {project && <span className="max-w-[200px] truncate font-normal opacity-85">· {project.name}</span>}
        </Button>
      </form>

      <section aria-labelledby="recent-h">
        <Eyebrow id="recent-h" className="mb-1.5">
          Recent
        </Eyebrow>
        {recents.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong px-3 py-3 text-[12px] leading-relaxed text-ink-3">
            Your last three project and task pairs will show up here, one tap to start again.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {recents.map((r) => (
              <li key={`${r.project.id}:${r.task?.id ?? ''}`}>
                <PairButton pair={r} onClick={() => store.start({ projectId: r.project.id, taskId: r.task?.id ?? null })} verb="Start" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function PairButton({ pair, onClick, verb }: { pair: Pair; onClick: () => void; verb: string }) {
  const label = `${verb} ${pair.project.name}${pair.task ? `, ${pair.task.name}` : ''}`
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group flex h-11 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
    >
      <ProjectDot color={pair.project.color} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{pair.project.name}</span>
        <span className="block truncate text-[12px] text-ink-3">{pair.task?.name ?? 'No task'}</span>
      </span>
      <span className="inline-flex size-7 items-center justify-center rounded-full text-ink-3 group-hover:bg-primary group-hover:text-on-primary">
        {verb === 'Start' ? <PlayIcon size={14} weight="fill" aria-hidden="true" /> : <ArrowsLeftRightIcon size={14} aria-hidden="true" />}
      </span>
    </button>
  )
}

function NoProjects() {
  const [, store] = useWherewent()
  const [name, setName] = useState('')
  const id = useId()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-display text-xl font-semibold">No projects yet</p>
      <p className="max-w-[260px] text-[13px] leading-relaxed text-ink-2">
        Add the first thing you are working on. You can add tasks as you go.
      </p>
      <form
        className="mt-1 flex w-full gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) store.addProject({ name, color: PROJECT_COLORS[0] })
        }}
      >
        <label htmlFor={id} className="sr-only">
          Project name
        </label>
        <input
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Client website"
          className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2.5 text-sm placeholder:text-ink-3"
        />
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          <PlusIcon size={16} aria-hidden="true" />
          Add
        </Button>
      </form>
    </div>
  )
}

/* --------------------------------------------------------------- running */

function RunningView({ state, now }: { state: State; now: number }) {
  const [, store] = useWherewent()
  const session = state.session!
  const project = findProject(state, session.projectId)
  const task = findTask(state, session.taskId)
  const running = !!session.runningSince
  const elapsed = sessionElapsed(session, now)
  const switchRef = useRef<HTMLButtonElement>(null)
  const [showAll, setShowAll] = useState(false)

  const switches = useMemo(
    () => recentPairs(state, 4, { projectId: session.projectId, taskId: session.taskId }),
    [state, session.projectId, session.taskId],
  )
  const dayStart = startOfDay(now)
  const today = totalsByProject(entriesWithLive(state, now), state.projects, dayStart, dayStart + DAY)
  const max = Math.max(...today.map((t) => t.ms), 1)
  const others = state.projects.filter((p) => !p.archived && p.id !== session.projectId)

  return (
    <div className="flex flex-col gap-4 p-3">
      {state.autoResumed && (
        <AutoResumeBanner
          state={state}
          onSwitch={() => {
            store.dismissAutoResumeNotice()
            switchRef.current?.focus()
          }}
        />
      )}

      <section aria-label="Current timer" className="rounded-lg border border-line bg-surface p-4">
        <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.08em] uppercase">
          {running ? (
            <>
              <span className="relative inline-flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
                <span className="relative size-2 rounded-full bg-primary" />
              </span>
              <span className="text-primary-ink">Tracking</span>
            </>
          ) : (
            <>
              <PauseIcon size={11} weight="fill" className="text-ink-3" aria-hidden="true" />
              <span className="text-ink-3">Paused</span>
            </>
          )}
        </p>
        <p
          className={cx('tnum mt-1 text-[44px] leading-none font-semibold tracking-[-0.02em]', !running && 'text-ink-3')}
          aria-label={`Elapsed ${formatDuration(elapsed)}`}
        >
          {formatClock(elapsed)}
        </p>
        <div className="mt-3 flex items-start gap-2">
          {project && <ProjectDot color={project.color} size={10} className="mt-1" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{project?.name}</p>
            <p className="truncate text-[13px] text-ink-2">{task?.name ?? 'No task'}</p>
          </div>
          <p className="tnum ml-auto shrink-0 text-[12px] text-ink-3">since {formatTime(session.startedAt)}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {running ? (
            <Button size="lg" onClick={() => store.pause()}>
              <PauseIcon size={18} weight="fill" aria-hidden="true" /> Pause
            </Button>
          ) : (
            <Button size="lg" variant="primary" onClick={() => store.resume()}>
              <PlayIcon size={18} weight="fill" aria-hidden="true" /> Resume
            </Button>
          )}
          <Button size="lg" onClick={() => store.stop()}>
            <StopIcon size={18} weight="fill" aria-hidden="true" /> Stop
          </Button>
        </div>
      </section>

      <section aria-labelledby="switch-h">
        <Eyebrow id="switch-h" className="mb-1.5">
          Switch to
        </Eyebrow>
        <ul className="flex flex-col gap-1">
          {switches.map((p, i) => (
            <li key={`${p.project.id}:${p.task?.id ?? ''}`}>
              <SwitchRow pair={p} first={i === 0 ? switchRef : undefined} onClick={() => store.switchTo({ projectId: p.project.id, taskId: p.task?.id ?? null })} />
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
          className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-ink-2 hover:text-ink"
        >
          <CaretDownIcon size={12} className={cx('transition-transform duration-150', showAll && 'rotate-180')} aria-hidden="true" />
          All projects
        </button>
        {showAll && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {others.map((p) => (
              <li key={p.id}>
                <ProjectChip project={p} onClick={() => store.switchTo({ projectId: p.id })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="today-h">
        <Eyebrow id="today-h" className="mb-2">
          Today by project
        </Eyebrow>
        <ul className="flex flex-col gap-2">
          {today.map(({ project: p, ms }) => (
            <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-center gap-2 text-[12px] text-ink-2">
                <ProjectDot color={p.color} />
                <span className="truncate">{p.name}</span>
              </span>
              <span className="tnum text-right text-[12px] font-semibold">{formatDuration(ms)}</span>
              <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${(ms / max) * 100}%`, background: projectColorVar(p.color) }} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function SwitchRow({ pair, onClick, first }: { pair: Pair; onClick: () => void; first?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={first}
      type="button"
      onClick={onClick}
      aria-label={`Switch to ${pair.project.name}${pair.task ? `, ${pair.task.name}` : ''}`}
      className="group flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors duration-150 hover:bg-surface"
    >
      <ProjectDot color={pair.project.color} />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <span className="font-medium text-ink">{pair.project.name}</span>
        <span className="text-ink-3"> / {pair.task?.name ?? 'No task'}</span>
      </span>
      <ArrowsLeftRightIcon size={14} className="text-ink-3 group-hover:text-primary-ink" aria-hidden="true" />
    </button>
  )
}

function ProjectChip({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Switch to ${project.name}`}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
    >
      <ProjectDot color={project.color} size={7} />
      {project.name}
    </button>
  )
}

/* ------------------------------------------------------- auto-resume UI */

export function AutoResumeBanner({ state, onSwitch, onDismiss }: { state: State; onSwitch: () => void; onDismiss?: () => void }) {
  const [, store] = useWherewent()
  const n = state.autoResumed!
  const project = findProject(state, n.projectId)
  const task = findTask(state, n.taskId)
  const away = n.returnedAt - n.awayStart
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-lg border border-primary/40 bg-primary-soft p-3">
      <ArrowClockwiseIcon size={18} className="mt-0.5 shrink-0 text-primary-ink" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">
          Resumed on {project?.name}
          {task && <span className="font-normal text-ink-2"> / {task.name}</span>}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-away">
          <span className="hatch-away inline-block h-2.5 w-4 rounded-[2px]" aria-hidden="true" />
          <span className="tnum">Away {formatDuration(away)}, not tracked</span>
        </p>
      </div>
      <Button size="sm" onClick={onSwitch}>
        Switch
      </Button>
      <IconButton label="Dismiss" className="-mr-1 size-7" onClick={onDismiss ?? (() => store.dismissAutoResumeNotice())}>
        <XIcon size={14} />
      </IconButton>
    </div>
  )
}

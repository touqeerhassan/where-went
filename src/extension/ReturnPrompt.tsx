import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, PlayIcon } from '@phosphor-icons/react'
import { useWherewent } from '../store'
import { findProject, findTask, formatDuration, formatTime, recentPairs } from '../lib/time'
import { Button, Kbd, LogoMark, ProjectDot } from './ui'

/**
 * Shown in a small 360 x 320 window when the user returns from idle and the
 * setting is "Ask me" (or the absence exceeded the auto-resume limit).
 * Keys: Enter resumes (default focus), P picks another, Esc stays stopped.
 */
export function ReturnPrompt({ autoFocus = true, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const [state, store] = useWherewent()
  const pr = state.pendingReturn
  const [picking, setPicking] = useState(false)
  const resumeRef = useRef<HTMLButtonElement>(null)
  const pickHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    if (picking) pickHeadingRef.current?.focus()
    else resumeRef.current?.focus()
  }, [picking, autoFocus, pr])

  const options = useMemo(() => (pr ? recentPairs(state, 4, pr.previous) : []), [state, pr])

  if (!pr) {
    return (
      <Frame>
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-ink-2">
          <p>Nothing to resume.</p>
        </div>
      </Frame>
    )
  }

  const project = findProject(state, pr.previous.projectId)
  const task = findTask(state, pr.previous.taskId)
  const away = pr.returnedAt - pr.awayStart
  const act = (fn: () => Promise<void>) => fn().then(() => onDone?.())

  return (
    <Frame
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return
        if (e.key === 'Escape') {
          e.preventDefault()
          if (picking) setPicking(false)
          else act(() => store.resolveReturn({ action: 'stay' }))
        } else if (!picking && (e.key === 'p' || e.key === 'P')) {
          e.preventDefault()
          setPicking(true)
        }
      }}
    >
      {!picking ? (
        <div className="flex h-full flex-col p-4">
          <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">
            <LogoMark size={14} /> Welcome back
          </p>
          <h1 className="mt-2 font-display text-[26px] leading-tight font-semibold tracking-[-0.01em]">
            You were away <span className="tnum">{formatDuration(away)}</span>
          </h1>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-2">
            <span className="hatch-away inline-block h-3 w-5 shrink-0 rounded-[2px]" aria-hidden="true" />
            <span>
              Since <span className="tnum">{formatTime(pr.awayStart)}</span>. Those minutes were not tracked.
            </span>
          </p>
          {pr.reason === 'too-long' && (
            <p className="mt-1 text-[12px] text-ink-3">
              Longer than your <span className="tnum">{formatDuration(state.settings.autoResumeMaxAwayMin * 60_000)}</span> auto-resume limit, so asking
              instead.
            </p>
          )}

          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            Resuming starts a new entry from now. The gap stays visible on your timeline.
          </p>

          <div className="mt-auto flex flex-col gap-1.5">
            <Button
              ref={resumeRef}
              variant="primary"
              size="lg"
              className="h-auto min-h-12 w-full justify-start py-2 text-left"
              onClick={() => act(() => store.resolveReturn({ action: 'resume' }))}
            >
              <PlayIcon size={18} weight="fill" aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px]">Resume</span>
                <span className="block truncate text-[12px] font-normal opacity-90">
                  {project?.name}
                  {task ? ` / ${task.name}` : ''}
                </span>
              </span>
              <span className="rounded-sm bg-black/15 px-1.5 py-px text-2xs font-medium" aria-hidden="true">
                Enter
              </span>
            </Button>
            <div className="grid grid-cols-2 gap-1.5">
              <Button onClick={() => setPicking(true)} aria-keyshortcuts="p">
                Pick another <Kbd>P</Kbd>
              </Button>
              <Button variant="ghost" onClick={() => act(() => store.resolveReturn({ action: 'stay' }))} aria-keyshortcuts="Escape">
                Stay stopped <Kbd>Esc</Kbd>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col p-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setPicking(false)} aria-label="Back">
              <ArrowLeftIcon size={14} aria-hidden="true" />
            </Button>
            <h1 ref={pickHeadingRef} tabIndex={-1} className="text-sm font-semibold">
              Start something else
            </h1>
          </div>
          <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {options.map((o) => (
              <li key={`${o.project.id}:${o.task?.id ?? ''}`}>
                <button
                  type="button"
                  onClick={() => act(() => store.resolveReturn({ action: 'switch', projectId: o.project.id, taskId: o.task?.id ?? null }))}
                  className="group flex h-11 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 text-left hover:border-line-strong hover:bg-surface-2"
                >
                  <ProjectDot color={o.project.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{o.project.name}</span>
                    <span className="block truncate text-[12px] text-ink-3">{o.task?.name ?? 'No task'}</span>
                  </span>
                  <ArrowRightIcon size={14} className="text-ink-3 group-hover:text-primary-ink" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink-3">
            <Kbd>Esc</Kbd> back
          </p>
        </div>
      )}
    </Frame>
  )
}

function Frame({ children, onKeyDown }: { children: React.ReactNode; onKeyDown?: React.KeyboardEventHandler }) {
  return (
    <div role="dialog" aria-label="Back from idle" onKeyDown={onKeyDown} className="h-[320px] w-[360px] overflow-hidden bg-bg text-ink">
      {children}
    </div>
  )
}

/** Desktop notification shown after an automatic resume (setting: Auto-resume). */
export function AutoResumeNotification({ onSwitch, onDismiss }: { onSwitch?: () => void; onDismiss?: () => void }) {
  const [state] = useWherewent()
  const n = state.autoResumed
  if (!n) return null
  const project = findProject(state, n.projectId)
  const task = findTask(state, n.taskId)
  return (
    <div role="status" className="w-[360px] rounded-xl border border-line bg-surface p-3 text-ink shadow-window">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
        <LogoMark size={14} />
        <span className="font-medium text-ink-2">Wherewent</span>
        <span aria-hidden="true">·</span>
        <span>now</span>
      </div>
      <div className="mt-2 flex gap-2.5">
        {project && <ProjectDot color={project.color} size={10} className="mt-1.5" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Resumed on {project?.name}
            {task && <span className="font-normal"> / {task.name}</span>}
          </p>
          <p className="tnum mt-0.5 text-[13px] text-ink-2">Away {formatDuration(n.returnedAt - n.awayStart)}, not tracked.</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={onSwitch}>
          Switch
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Keep going
        </Button>
      </div>
    </div>
  )
}

/**
 * The service worker's brain, with chrome.* abstracted behind `Platform` and
 * `KeyValueArea` so it can be tested with fake timers and a fake storage.
 *
 * Every event loads state from storage, applies a pure engine step, writes
 * back only the changed keys, then performs side effects. Nothing survives in
 * memory between events except a promise chain that serialises them, so a
 * killed and restarted worker behaves exactly like a long-lived one.
 */
import type { Entry, Project, ProjectColor, Settings, State, Task } from '../types'
import * as E from './engine'
import type { Effect, ReturnChoice, Step, TaskRef } from './engine'
import { diffRecord, loadState, type KeyValueArea } from './storage'

export type IdleState = 'active' | 'idle' | 'locked'
export type PromptMode = 'return' | 'pick' | 'switch'

export interface Platform {
  showAsk(state: State, pending: NonNullable<State['pendingResume']>): Promise<void>
  showAuto(state: State, notice: NonNullable<State['autoResumed']>): Promise<void>
  clearReturn(): Promise<void>
  clearAuto(): Promise<void>
  openPrompt(mode: PromptMode): Promise<void>
  setIdleInterval(seconds: number): Promise<void>
  queryIdle(seconds: number): Promise<IdleState>
  syncBadge(state: State): Promise<void>
}

/** Messages the UI sends to the worker. The worker is the only writer. */
export type Command =
  | { cmd: 'sync' }
  | { cmd: 'start'; ref: TaskRef }
  | { cmd: 'switchTo'; ref: TaskRef }
  | { cmd: 'stop' }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'resolveReturn'; choice: ReturnChoice }
  | { cmd: 'dismissAutoResumeNotice' }
  | { cmd: 'addEntry'; entry: Pick<Entry, 'projectId' | 'taskId' | 'start' | 'end'> }
  | { cmd: 'updateEntry'; id: string; patch: Partial<Pick<Entry, 'projectId' | 'taskId' | 'start' | 'end'>> }
  | { cmd: 'deleteEntry'; id: string }
  | { cmd: 'restoreEntry'; entry: Entry }
  | { cmd: 'addProject'; input: { name: string; color: ProjectColor } }
  | { cmd: 'updateProject'; id: string; patch: Partial<Pick<Project, 'name' | 'color' | 'archived'>> }
  | { cmd: 'addTask'; projectId: string; name: string }
  | { cmd: 'updateTask'; id: string; patch: Partial<Pick<Task, 'name' | 'archived'>> }
  | { cmd: 'updateSettings'; patch: Partial<Settings> }
  | { cmd: 'completeOnboarding'; input: { projects: { name: string; color: ProjectColor }[]; settings: Partial<Settings> } }
  | { cmd: 'openPrompt'; mode: PromptMode }

type Outcome = Step & { result?: unknown }

export interface ControllerDeps {
  area: KeyValueArea
  platform: Platform
  now?: () => number
}

export function createController({ area, platform, now = Date.now }: ControllerDeps) {
  let chain: Promise<unknown> = Promise.resolve()

  async function perform(effects: Effect[], state: State) {
    for (const e of effects) {
      if (e.type === 'ask') await platform.showAsk(state, e.pending)
      else if (e.type === 'auto') await platform.showAuto(state, e.notice)
      else if (e.type === 'clear-return') await platform.clearReturn()
      else if (e.type === 'clear-auto') await platform.clearAuto()
      else if (e.type === 'idle-interval') await platform.setIdleInterval(e.seconds)
    }
  }

  /** Serialise: load, apply, persist diff, then side effects. */
  function run<T = unknown>(fn: (s: State, t: number) => Outcome, opts: { checkReturn?: boolean } = {}): Promise<T> {
    const job = chain.then(async () => {
      const prev = await loadState(area)
      const t = now()
      const out = fn(prev, t)
      let state = out.state
      const effects = [...out.effects]

      // A pending return created by sleep or startup recovery: if the user is
      // already back, apply the return behaviour now instead of waiting.
      if (opts.checkReturn !== false && state.pendingResume && state.pendingResume.returnedAt == null && !state.active) {
        const idleState = await platform.queryIdle(state.settings.idleThresholdSec)
        if (idleState === 'active') {
          const r = E.active(state, t)
          state = r.state
          effects.push(...r.effects)
        }
      }

      const diff = diffRecord(prev, state)
      if (Object.keys(diff).length) await area.set(diff)
      await perform(effects, state)
      await platform.syncBadge(state)
      return out.result as T
    })
    chain = job.catch(() => undefined)
    return job
  }

  const step = (state: State, result?: unknown): Outcome => ({ state, effects: [], result })

  function dispatch(c: Command, s: State, t: number): Outcome {
    // Any user command means the user is here: detect a missed sleep first.
    const pre = c.cmd === 'openPrompt' ? { state: s, effects: [] } : E.reconcile(s, t)
    const base = pre.state
    const merge = (o: Outcome): Outcome => ({ ...o, effects: [...pre.effects, ...o.effects] })
    switch (c.cmd) {
      case 'sync':
        return merge(step(base))
      case 'start':
        return merge(E.start(base, c.ref, t))
      case 'switchTo':
        return merge(E.switchTo(base, c.ref, t))
      case 'stop':
        return merge(E.stop(base, t))
      case 'pause':
        return merge(E.pause(base, t))
      case 'resume':
        return merge(E.resume(base, t))
      case 'resolveReturn':
        return merge(E.resolveReturn(base, c.choice, t))
      case 'dismissAutoResumeNotice':
        return merge(E.dismissAutoResumeNotice(base))
      case 'addEntry': {
        const r = E.addEntry(base, c.entry)
        return merge(step(r.state, r.entry))
      }
      case 'updateEntry':
        return merge(step(E.updateEntry(base, c.id, c.patch)))
      case 'deleteEntry': {
        const r = E.deleteEntry(base, c.id)
        return merge(step(r.state, r.removed))
      }
      case 'restoreEntry':
        return merge(step(E.restoreEntry(base, c.entry)))
      case 'addProject': {
        const r = E.addProject(base, c.input, t)
        return merge(step(r.state, r.project))
      }
      case 'updateProject':
        return merge(E.updateProject(base, c.id, c.patch, t))
      case 'addTask': {
        const r = E.addTask(base, c.projectId, c.name)
        return merge(step(r.state, r.task))
      }
      case 'updateTask':
        return merge(step(E.updateTask(base, c.id, c.patch)))
      case 'updateSettings':
        return merge(E.updateSettings(base, c.patch))
      case 'completeOnboarding':
        return merge(E.completeOnboarding(base, c.input, t))
      case 'openPrompt':
        return step(base)
    }
  }

  return {
    /** Every worker wake: make sure Chrome uses the stored idle threshold. */
    async init() {
      const s = await loadState(area)
      await platform.setIdleInterval(s.settings.idleThresholdSec)
      await platform.syncBadge(s)
    },
    onIdleState(st: IdleState) {
      return st === 'active' ? run((s, t) => E.active(s, t)) : run((s, t) => E.idle(s, t), { checkReturn: false })
    },
    onHeartbeat() {
      return run((s, t) => E.heartbeat(s, t))
    },
    onStartup() {
      return run((s, t) => E.startup(s, t))
    },
    onInstalled() {
      return run((s, t) => ({ state: { ...E.prune(s, t), lastSeen: t }, effects: [{ type: 'idle-interval', seconds: s.settings.idleThresholdSec }] }))
    },
    onPruneAlarm() {
      return run((s, t) => ({ state: E.prune(s, t), effects: [] }))
    },
    async onCommand(c: Command) {
      const result = await run((s, t) => dispatch(c, s, t))
      if (c.cmd === 'openPrompt') await platform.openPrompt(c.mode)
      return result
    },
    /** Notification buttons: ask = [Resume, Choose another], auto = [Switch]. */
    async onNotificationButton(kind: 'ask' | 'auto', index: number) {
      if (kind === 'ask' && index === 0) return run((s, t) => E.resolveReturn(s, { action: 'resume' }, t))
      if (kind === 'ask') return platform.openPrompt('pick')
      return platform.openPrompt('switch')
    },
    async onNotificationClicked(kind: 'ask' | 'auto') {
      return platform.openPrompt(kind === 'ask' ? 'return' : 'switch')
    },
    /** For tests: wait until queued work has finished. */
    idle: () => chain,
  }
}

export type Controller = ReturnType<typeof createController>

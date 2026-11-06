/**
 * In-memory WherewentStore for the prototype shell and landing page. It runs
 * the same pure engine as the service worker; effects are reflected in state
 * (pendingResume / autoResumed) rather than real notifications.
 */
import type { WherewentStore } from '../store'
import type { State } from '../types'
import * as E from '../core/engine'
import { exportData } from '../core/export'

export { emptyState } from '../core/engine'

export interface MockStore extends WherewentStore {
  /** Prototype only: replace the whole state (used by the screen switcher). */
  replaceState(next: State): void
  /** Prototype only: pretend the user stopped `awayMs` ago and has just come back. */
  simulateAway(awayMs: number): void
}

export function createMockStore(initial: State = E.emptyState(), clock: () => number = Date.now): MockStore {
  let state = E.prune(initial, clock())
  const listeners = new Set<() => void>()
  const commit = (next: State) => {
    if (next === state) return
    state = next
    listeners.forEach((l) => l())
  }
  const apply = (step: E.Step) => {
    commit(step.state)
    return Promise.resolve()
  }

  return {
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    replaceState: (next) => commit(E.prune(next, clock())),
    simulateAway(awayMs) {
      const now = clock()
      // An idle event fired `threshold` after the user stopped, `awayMs` ago.
      const idleAt = now - awayMs + state.settings.idleThresholdSec * 1000
      let next = E.idle({ ...state, lastSeen: idleAt }, idleAt).state
      next = E.active(next, now).state
      commit(next)
    },

    start: (ref) => apply(E.start(state, ref, clock())),
    pause: () => apply(E.pause(state, clock())),
    resume: () => apply(E.resume(state, clock())),
    stop: () => apply(E.stop(state, clock())),
    switchTo: (ref) => apply(E.switchTo(state, ref, clock())),
    resolveReturn: (choice) => apply(E.resolveReturn(state, choice, clock())),
    dismissAutoResumeNotice: () => apply(E.dismissAutoResumeNotice(state)),

    addEntry(input) {
      const r = E.addEntry(state, input)
      commit(r.state)
      return Promise.resolve(r.entry)
    },
    updateEntry: (id, patch) => apply({ state: E.updateEntry(state, id, patch), effects: [] }),
    deleteEntry(id) {
      const r = E.deleteEntry(state, id)
      commit(r.state)
      return Promise.resolve(r.removed)
    },
    restoreEntry: (entry) => apply({ state: E.restoreEntry(state, entry), effects: [] }),
    addProject(input) {
      const r = E.addProject(state, input, clock())
      commit(r.state)
      return Promise.resolve(r.project)
    },
    updateProject: (id, patch) => apply(E.updateProject(state, id, patch, clock())),
    addTask(projectId, name) {
      const r = E.addTask(state, projectId, name)
      commit(r.state)
      return Promise.resolve(r.task)
    },
    updateTask: (id, patch) => apply({ state: E.updateTask(state, id, patch), effects: [] }),
    updateSettings: (patch) => apply(E.updateSettings(state, patch)),
    completeOnboarding: (input) => apply(E.completeOnboarding(state, input, clock())),
    exportData: (format) => Promise.resolve(exportData(state, format, clock())),
  }
}

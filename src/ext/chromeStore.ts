/**
 * WherewentStore backed by chrome.storage.local.
 *
 * Reads: a snapshot hydrated from storage and kept current via
 * chrome.storage.onChanged (so every open page sees the same state).
 * Writes: every mutation is a message to the service worker, which is the
 * only writer. That avoids read-modify-write races between the popup, the
 * dashboard, the prompt window and idle events.
 */
import type { WherewentStore } from '../store'
import type { State } from '../types'
import type { Command } from '../core/controller'
import { STATE_KEYS, stateFromRecord } from '../core/storage'
import { exportData } from '../core/export'

export interface Reply {
  ok: boolean
  result?: unknown
  error?: string
}

export async function send<T = unknown>(command: Command): Promise<T> {
  const reply = (await chrome.runtime.sendMessage({ ww: command })) as Reply | undefined
  if (!reply?.ok) throw new Error(reply?.error ?? 'No response from the Wherewent background worker')
  return reply.result as T
}

export async function createChromeStore(): Promise<WherewentStore> {
  // Ask the worker to reconcile first (e.g. after sleep) so the first paint is correct.
  await send({ cmd: 'sync' }).catch(() => undefined)
  let state: State = stateFromRecord(await chrome.storage.local.get([...STATE_KEYS]))
  const listeners = new Set<() => void>()

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    let touched = false
    const next = { ...state } as Record<string, unknown>
    for (const k of STATE_KEYS) {
      if (k in changes) {
        next[k] = changes[k].newValue
        touched = true
      }
    }
    if (!touched) return
    state = stateFromRecord(next)
    listeners.forEach((l) => l())
  })

  const v = (c: Command) => send<void>(c)

  return {
    getState: () => state,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    start: (ref) => v({ cmd: 'start', ref }),
    pause: () => v({ cmd: 'pause' }),
    resume: () => v({ cmd: 'resume' }),
    stop: () => v({ cmd: 'stop' }),
    switchTo: (ref) => v({ cmd: 'switchTo', ref }),
    resolveReturn: (choice) => v({ cmd: 'resolveReturn', choice }),
    dismissAutoResumeNotice: () => v({ cmd: 'dismissAutoResumeNotice' }),
    addEntry: (entry) => send({ cmd: 'addEntry', entry }),
    updateEntry: (id, patch) => v({ cmd: 'updateEntry', id, patch }),
    deleteEntry: (id) => send({ cmd: 'deleteEntry', id }),
    restoreEntry: (entry) => v({ cmd: 'restoreEntry', entry }),
    addProject: (input) => send({ cmd: 'addProject', input }),
    updateProject: (id, patch) => v({ cmd: 'updateProject', id, patch }),
    addTask: (projectId, name) => send({ cmd: 'addTask', projectId, name }),
    updateTask: (id, patch) => v({ cmd: 'updateTask', id, patch }),
    updateSettings: (patch) => v({ cmd: 'updateSettings', patch }),
    completeOnboarding: (input) => v({ cmd: 'completeOnboarding', input }),
    exportData: (format) => Promise.resolve(exportData(state, format, Date.now())),
  }
}

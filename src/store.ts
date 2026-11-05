/**
 * The single seam between UI and persistence.
 *
 * Components only ever talk to a `WherewentStore` obtained from `useWherewent()`.
 * Today the active implementation is an in-memory mock (src/mock/mockStore.ts).
 * A later session swaps `defaultStore` for a chrome.storage-backed implementation
 * of the same interface; no component changes are needed.
 *
 * Contract notes for implementers:
 *  - `getState()` must be synchronous and return an immutable snapshot (same
 *    reference until something changes). Keep an in-memory cache, hydrate it
 *    from storage on boot, and update it from `chrome.storage.onChanged`.
 *  - Every mutation is async and resolves after the write is persisted.
 *  - `subscribe` listeners fire after every committed change.
 *  - Idle handling: the background worker calls `goIdle(lastActiveAt)` when the
 *    idle threshold is crossed and `returnFromIdle(now)` on activity. The store
 *    decides between asking (pendingReturn) and auto-resuming (autoResumed).
 */
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { Entry, Project, ProjectColor, Settings, State, Task } from './types'
import { createMockStore } from './mock/mockStore'

export type * from './types'

/** Identify a task by id, or by a typed name (created on demand inside the project). */
export interface TaskRef {
  projectId: string
  taskId?: string | null
  taskName?: string
}

export type ReturnChoice =
  | { action: 'resume' }
  | ({ action: 'switch' } & TaskRef)
  | { action: 'stay' }

export type ExportFormat = 'csv' | 'json'

export interface WherewentStore {
  getState(): State
  subscribe(listener: () => void): () => void

  // Timer
  start(ref: TaskRef): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  /** Close the running entry and immediately start a new one. */
  switchTo(ref: TaskRef): Promise<void>

  // Idle lifecycle
  goIdle(lastActiveAt: number): Promise<void>
  returnFromIdle(at: number): Promise<void>
  resolveReturn(choice: ReturnChoice): Promise<void>
  dismissAutoResumeNotice(): Promise<void>

  // Entries
  addEntry(entry: Pick<Entry, 'projectId' | 'taskId' | 'start' | 'end'>): Promise<Entry>
  updateEntry(id: string, patch: Partial<Pick<Entry, 'projectId' | 'taskId' | 'start' | 'end'>>): Promise<void>
  /** Returns the removed entry so the UI can offer undo via `restoreEntry`. */
  deleteEntry(id: string): Promise<Entry | undefined>
  restoreEntry(entry: Entry): Promise<void>

  // Projects and tasks
  addProject(input: { name: string; color: ProjectColor }): Promise<Project>
  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'color' | 'archived'>>): Promise<void>
  addTask(projectId: string, name: string): Promise<Task>
  updateTask(id: string, patch: Partial<Pick<Task, 'name' | 'archived'>>): Promise<void>

  // Settings and lifecycle
  updateSettings(patch: Partial<Settings>): Promise<void>
  completeOnboarding(input: { projects: { name: string; color: ProjectColor }[]; settings: Partial<Settings> }): Promise<void>

  /** Serialise everything to a downloadable string. Never leaves the device. */
  exportData(format: ExportFormat): Promise<string>
}

/** The app-wide instance. Swap this line for the chrome.storage implementation. */
export const defaultStore: WherewentStore = createMockStore()

const StoreContext = createContext<WherewentStore>(defaultStore)

/** Scope a subtree to a specific store (the landing page renders several isolated demos). */
export function StoreProvider({ store, children }: { store: WherewentStore; children: ReactNode }) {
  return createElement(StoreContext.Provider, { value: store }, children)
}

/** Current snapshot + the store for calling actions. */
export function useWherewent(): [State, WherewentStore] {
  const store = useContext(StoreContext)
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  return [state, store]
}

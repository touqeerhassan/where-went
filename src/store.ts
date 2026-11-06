/**
 * The single seam between UI and persistence.
 *
 * Components only ever talk to a `WherewentStore` obtained from `useWherewent()`.
 * - In the extension, the store is `createChromeStore()` (src/ext/chromeStore.ts):
 *   reads chrome.storage.local, sends every mutation to the service worker.
 * - The prototype shell and the landing page use `createMockStore()`
 *   (src/mock/mockStore.ts), which runs the same pure engine in memory.
 */
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { Entry, Project, ProjectColor, Settings, State, Task } from './types'
import type { ReturnChoice, TaskRef } from './core/engine'
import type { ExportFormat } from './core/export'

export type * from './types'
export type { ReturnChoice, TaskRef, ExportFormat }

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

  // Return from idle
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

const StoreContext = createContext<WherewentStore | null>(null)

export function StoreProvider({ store, children }: { store: WherewentStore; children: ReactNode }) {
  return createElement(StoreContext.Provider, { value: store }, children)
}

/** Current snapshot + the store for calling actions. */
export function useWherewent(): [State, WherewentStore] {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useWherewent() needs a <StoreProvider>')
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  return [state, store]
}

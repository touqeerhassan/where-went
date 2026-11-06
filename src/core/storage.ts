/**
 * How State maps onto chrome.storage.local: one key per field, so the minute
 * heartbeat rewrites `lastSeen` only, not the whole entry list.
 */
import { DEFAULT_SETTINGS, type State } from '../types'
import { emptyState } from './engine'

export const SCHEMA_VERSION = 1

export const STATE_KEYS = [
  'onboarded',
  'projects',
  'tasks',
  'entries',
  'away',
  'settings',
  'active',
  'paused',
  'pendingResume',
  'autoResumed',
  'lastSeen',
] as const satisfies readonly (keyof State)[]

export type StoredRecord = Partial<Record<(typeof STATE_KEYS)[number] | 'schemaVersion', unknown>>

/** Minimal async key/value area. chrome.storage.local satisfies it; tests use a Map. */
export interface KeyValueArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

export function stateFromRecord(rec: Record<string, unknown>): State {
  const base = emptyState()
  const s = { ...base } as Record<string, unknown>
  for (const k of STATE_KEYS) if (rec[k] !== undefined) s[k] = rec[k]
  const state = s as unknown as State
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings ?? {}) }
  return state
}

/** Only the keys whose value changed (by reference) between two states. */
export function diffRecord(prev: State, next: State): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of STATE_KEYS) if (prev[k] !== next[k]) out[k] = next[k]
  return out
}

export async function loadState(area: KeyValueArea): Promise<State> {
  return stateFromRecord(await area.get([...STATE_KEYS]))
}

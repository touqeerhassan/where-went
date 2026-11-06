/** Test helpers: in-memory storage area and a recording fake platform. Not shipped. */
import type { State } from '../types'
import type { IdleState, Platform, PromptMode } from './controller'
import type { KeyValueArea } from './storage'

export function memoryArea(initial: Record<string, unknown> = {}): KeyValueArea & { data: Map<string, unknown>; writes: Record<string, unknown>[] } {
  const data = new Map(Object.entries(structuredClone(initial)))
  const writes: Record<string, unknown>[] = []
  return {
    data,
    writes,
    async get(keys) {
      const out: Record<string, unknown> = {}
      for (const k of keys ?? [...data.keys()]) if (data.has(k)) out[k] = structuredClone(data.get(k))
      return out
    },
    async set(items) {
      writes.push(items)
      for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v))
    },
  }
}

export type PlatformCall =
  | { type: 'ask'; projectId: string; idleSince: number; returnedAt: number | null }
  | { type: 'auto'; projectId: string; awayStart: number; returnedAt: number }
  | { type: 'clear-return' }
  | { type: 'clear-auto' }
  | { type: 'open-prompt'; mode: PromptMode }
  | { type: 'idle-interval'; seconds: number }

export function fakePlatform(opts: { idle?: IdleState; notificationsBlocked?: boolean } = {}) {
  const calls: PlatformCall[] = []
  const badge: { text: string }[] = []
  const p: Platform & { calls: PlatformCall[]; idleState: IdleState; badge: typeof badge } = {
    calls,
    badge,
    idleState: opts.idle ?? 'active',
    async showAsk(_s, pending) {
      calls.push({ type: 'ask', projectId: pending.projectId, idleSince: pending.idleSince, returnedAt: pending.returnedAt })
    },
    async showAuto(_s, n) {
      calls.push({ type: 'auto', projectId: n.projectId, awayStart: n.awayStart, returnedAt: n.returnedAt })
    },
    async clearReturn() {
      calls.push({ type: 'clear-return' })
    },
    async clearAuto() {
      calls.push({ type: 'clear-auto' })
    },
    async openPrompt(mode) {
      calls.push({ type: 'open-prompt', mode })
    },
    async setIdleInterval(seconds) {
      calls.push({ type: 'idle-interval', seconds })
    },
    async queryIdle() {
      return p.idleState
    },
    async syncBadge(s: State) {
      badge.push({ text: s.pendingResume?.returnedAt != null && opts.notificationsBlocked ? '!' : '' })
    },
  }
  return p
}

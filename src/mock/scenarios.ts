/** Named states used by the prototype screen switcher and the landing page demos. */
import type { State } from '../types'
import { MIN } from '../lib/time'
import { createMockStore, emptyState, type MockStore } from './mockStore'
import { seedProjects, seedState } from './seed'

export type ScenarioName = 'onboarding' | 'empty' | 'idle' | 'running' | 'return' | 'auto-resume' | 'dashboard'

const CURRENT = { projectId: 'p_northwind', taskId: 'p_northwind_t0' }

export function scenarioState(name: ScenarioName, now = Date.now()): State {
  switch (name) {
    case 'onboarding':
      return emptyState()
    case 'empty': {
      const { projects } = seedProjects(now)
      return {
        ...emptyState(),
        onboarded: true,
        projects: projects.filter((p) => ['p_northwind', 'p_halden', 'p_ledgerly'].includes(p.id)),
        tasks: [],
      }
    }
    case 'idle':
      return seedState(now)
    case 'running':
    case 'dashboard': {
      const s = seedState(now, { todayUntil: now - 47 * MIN })
      return { ...s, session: { ...CURRENT, startedAt: now - 47 * MIN, accumulatedMs: 0, runningSince: now - 47 * MIN - 13_000 } }
    }
    case 'return': {
      const s = seedState(now, { todayUntil: now - 14 * MIN })
      return {
        ...s,
        away: [...s.away, { id: 'a_now', start: now - 14 * MIN, end: now }],
        pendingReturn: { awayStart: now - 14 * MIN, returnedAt: now, previous: CURRENT, reason: 'ask' },
      }
    }
    case 'auto-resume': {
      const s = seedState(now, { todayUntil: now - 15 * MIN })
      return {
        ...s,
        settings: { ...s.settings, onReturn: 'auto' },
        away: [...s.away, { id: 'a_now', start: now - 15 * MIN, end: now - 1 * MIN }],
        session: { ...CURRENT, startedAt: now - MIN, accumulatedMs: 0, runningSince: now - MIN },
        autoResumed: { awayStart: now - 15 * MIN, returnedAt: now - MIN, ...CURRENT },
      }
    }
  }
}

export function scenarioStore(name: ScenarioName): MockStore {
  return createMockStore(scenarioState(name))
}

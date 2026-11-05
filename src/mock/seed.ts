/**
 * Deterministic mock data: 6 projects, 3 weeks of entries with idle gaps,
 * generated relative to "now" so today always has data.
 */
import type { AwayPeriod, Entry, EntryEnd, Project, State, Task } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { HOUR, MIN, addDays, startOfDay } from '../lib/time'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PROJECTS: Array<Omit<Project, 'createdAt'> & { weight: number; tasks: string[] }> = [
  { id: 'p_northwind', name: 'Northwind Clinic portal', color: 'pine', archived: false, weight: 5, tasks: ['Appointment booking flow', 'API integration', 'QA pass', 'Client call'] },
  { id: 'p_halden', name: 'Halden Coffee Shopify', color: 'ochre', archived: false, weight: 4, tasks: ['Theme build', 'Product import', 'Checkout fixes'] },
  { id: 'p_ledgerly', name: 'Ledgerly (own product)', color: 'cobalt', archived: false, weight: 3, tasks: ['Onboarding redesign', 'Billing bug', 'Changelog'] },
  { id: 'p_brightline', name: 'Brightline Legal intake', color: 'plum', archived: false, weight: 3, tasks: ['Discovery workshop', 'Form logic', 'Scope doc'] },
  { id: 'p_sales', name: 'Sales & proposals', color: 'brick', archived: false, weight: 2, tasks: ['Proposal: Fernhill', 'Discovery calls', 'Pricing sheet'] },
  { id: 'p_ops', name: 'Agency ops', color: 'slate', archived: false, weight: 2, tasks: ['Invoicing', 'Hiring', 'Weekly planning'] },
]

export const SEED_PROJECT_IDS = PROJECTS.map((p) => p.id)

export function seedProjects(now: number): { projects: Project[]; tasks: Task[] } {
  const projects: Project[] = PROJECTS.map(({ weight: _w, tasks: _t, ...p }) => ({ ...p, createdAt: addDays(now, -40) }))
  const tasks: Task[] = PROJECTS.flatMap((p) =>
    p.tasks.map((name, i) => ({ id: `${p.id}_t${i}`, projectId: p.id, name, archived: false })),
  )
  // One archived project + task so archive UI has something to show.
  projects.push({ id: 'p_old', name: 'Kestrel rebrand (done)', color: 'rose', archived: true, createdAt: addDays(now, -90) })
  tasks.push({ id: 'p_old_t0', projectId: 'p_old', name: 'Logo handoff', archived: false })
  tasks.push({ id: 'p_halden_t9', projectId: 'p_halden', name: 'Old landing page', archived: true })
  return { projects, tasks }
}

function pick<T extends { weight: number }>(items: T[], r: () => number): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let x = r() * total
  for (const i of items) {
    x -= i.weight
    if (x <= 0) return i
  }
  return items[items.length - 1]
}

export function seedState(now: number, opts: { todayUntil?: number } = {}): State {
  const r = rng(20261105)
  const { projects, tasks } = seedProjects(now)
  const entries: Entry[] = []
  const away: AwayPeriod[] = []
  let n = 0
  const today = startOfDay(now)
  const todayUntil = opts.todayUntil ?? now - 50 * MIN

  for (let d = -20; d <= 0; d++) {
    const day = startOfDay(addDays(today, d))
    const dow = new Date(day).getDay()
    if (dow === 0) continue
    if (dow === 6 && r() < 0.6) continue
    const isToday = d === 0
    const light = dow === 6

    let t = day + (8.5 + r()) * HOUR
    let dayEnd = day + (light ? 12 + r() * 2 : 17.5 + r() * 1.5) * HOUR
    // Today only has work that already happened (nothing before ~8:30).
    if (isToday) dayEnd = todayUntil
    let lunchDone = light
    let project = pick(PROJECTS, r)

    while (t < dayEnd - 15 * MIN) {
      const len = Math.min((25 + r() * 85) * MIN, dayEnd - t)
      const taskIdx = Math.floor(r() * project.tasks.length)
      const end = t + len
      // decide what ended this block
      let endedBy: EntryEnd
      let gap: number
      const hourOfDay = (end - day) / HOUR
      const roll = r()
      if (!lunchDone && hourOfDay > 12.3) {
        endedBy = 'stop'
        gap = (40 + r() * 25) * MIN
        lunchDone = true
      } else if (roll < 0.3) {
        endedBy = 'idle'
        gap = (6 + r() * 38) * MIN
      } else if (roll < 0.75) {
        endedBy = 'switch'
        gap = 0
      } else {
        endedBy = 'pause'
        gap = (3 + r() * 10) * MIN
      }
      const isLast = end >= dayEnd - 15 * MIN
      entries.push({
        id: `e_seed_${n++}`,
        projectId: project.id,
        taskId: `${project.id}_t${taskIdx}`,
        start: Math.round(t),
        end: Math.round(end),
        source: 'timer',
        endedBy: isLast ? 'stop' : endedBy,
      })
      if (endedBy === 'idle' && !isLast) away.push({ id: `a_seed_${n}`, start: Math.round(end), end: Math.round(end + gap) })
      t = end + gap
      if (endedBy === 'switch' || r() < 0.4) project = pick(PROJECTS, r)
    }
  }

  // A couple of manual corrections so the "manual" badge appears.
  const yday = startOfDay(addDays(today, -1))
  entries.push({ id: 'e_seed_manual1', projectId: 'p_sales', taskId: 'p_sales_t1', start: yday + 19.5 * HOUR, end: yday + 20.25 * HOUR, source: 'manual', endedBy: 'manual' })

  return {
    onboarded: true,
    projects,
    tasks,
    entries,
    away,
    session: null,
    idle: null,
    settings: { ...DEFAULT_SETTINGS },
    pendingReturn: null,
    autoResumed: null,
  }
}

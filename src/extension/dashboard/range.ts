import { DAY, addDays, startOfDay, startOfWeek } from '../../lib/time'

export type RangeKind = 'day' | 'week' | 'month' | '6m'

export interface Range {
  kind: RangeKind
  from: number
  to: number
  label: string
  /** Bucket boundaries for the totals chart. */
  buckets: { from: number; to: number; label: string; short: string }[]
}

const monthLong = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' })
const md = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const wd = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const full = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

function startOfMonth(t: number) {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}
function addMonths(t: number, n: number) {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime()
}

export function computeRange(kind: RangeKind, anchor: number, now: number): Range {
  const days = (from: number, to: number) => {
    const out: Range['buckets'] = []
    for (let t = from; t < to; t = addDays(t, 1)) {
      out.push({ from: t, to: addDays(t, 1), label: full.format(t), short: kind === 'week' ? wd.format(t) : String(new Date(t).getDate()) })
    }
    return out
  }
  switch (kind) {
    case 'day': {
      const from = startOfDay(anchor)
      const isToday = from === startOfDay(now)
      return { kind, from, to: from + DAY, label: isToday ? `Today, ${md.format(from)}` : full.format(from), buckets: [] }
    }
    case 'week': {
      const from = startOfWeek(anchor)
      const to = addDays(from, 7)
      return { kind, from, to, label: `${md.format(from)} – ${md.format(addDays(to, -1))}`, buckets: days(from, to) }
    }
    case 'month': {
      const from = startOfMonth(anchor)
      const to = addMonths(from, 1)
      return { kind, from, to, label: monthLong.format(from), buckets: days(from, to) }
    }
    case '6m': {
      const to = addMonths(startOfMonth(anchor), 1)
      const from = addMonths(to, -6)
      const buckets: Range['buckets'] = []
      for (let w = startOfWeek(from); w < to; w = addDays(w, 7)) {
        buckets.push({ from: Math.max(w, from), to: Math.min(addDays(w, 7), to), label: `Week of ${md.format(w)}`, short: monthShort.format(w) })
      }
      return { kind, from, to, label: `${monthShort.format(from)} – ${monthLong.format(addMonths(to, -1))}`, buckets }
    }
  }
}

export function shiftAnchor(kind: RangeKind, anchor: number, dir: -1 | 1): number {
  switch (kind) {
    case 'day':
      return addDays(anchor, dir)
    case 'week':
      return addDays(anchor, 7 * dir)
    case 'month':
      return addMonths(anchor, dir)
    case '6m':
      return addMonths(anchor, 6 * dir)
  }
}

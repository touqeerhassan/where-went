// Domain model. Plain JSON-serialisable data stored in chrome.storage.local.

export type ProjectColor = 'pine' | 'cobalt' | 'ochre' | 'brick' | 'plum' | 'olive' | 'rose' | 'slate'

export const PROJECT_COLORS: ProjectColor[] = ['pine', 'cobalt', 'ochre', 'brick', 'plum', 'olive', 'rose', 'slate']

export interface Project {
  id: string
  name: string
  color: ProjectColor
  archived: boolean
  createdAt: number
}

export interface Task {
  id: string
  projectId: string
  name: string
  archived: boolean
}

export type EntryEnd = 'stop' | 'pause' | 'switch' | 'idle' | 'manual'

/** A closed block of tracked time. Times are epoch ms. */
export interface Entry {
  id: string
  projectId: string
  taskId: string | null
  start: number
  end: number
  source: 'timer' | 'manual'
  endedBy: EntryEnd
}

/** A period the user was away (idle) while a timer had been running. Never counted. */
export interface AwayPeriod {
  id: string
  start: number
  end: number
}

/**
 * The running timer. This is the only timer state; elapsed time is always
 * `now - startedAt`, never a counter.
 */
export interface ActiveTimer {
  projectId: string
  taskId: string | null
  startedAt: number
}

/** A timer the user paused. Its last segment is already saved as an entry. */
export interface PausedTimer extends ActiveTimer {
  pausedAt: number
}

/**
 * Set when the user goes idle with a timer running. `idleSince` is the
 * backdated moment they actually stopped. `returnedAt` is set once they come
 * back and are being asked (Ask me, or Auto-resume over the limit).
 */
export interface PendingResume {
  projectId: string
  taskId: string | null
  idleSince: number
  returnedAt: number | null
  reason: 'ask' | 'too-long' | null
}

/** Shown after an automatic resume. */
export interface AutoResumeNotice {
  projectId: string
  taskId: string | null
  awayStart: number
  returnedAt: number
}

export type ReturnBehavior = 'ask' | 'auto'

export interface Settings {
  /** Seconds without input before the timer stops itself. Minimum 15. */
  idleThresholdSec: number
  onReturn: ReturnBehavior
  /** Above this many minutes away, auto-resume falls back to asking. */
  autoResumeMaxAwayMin: number
}

export interface State {
  onboarded: boolean
  projects: Project[]
  tasks: Task[]
  entries: Entry[]
  away: AwayPeriod[]
  settings: Settings
  active: ActiveTimer | null
  paused: PausedTimer | null
  pendingResume: PendingResume | null
  autoResumed: AutoResumeNotice | null
  /** Heartbeat written every minute; used to cap entries after sleep or a closed browser. */
  lastSeen: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  idleThresholdSec: 120,
  onReturn: 'ask',
  autoResumeMaxAwayMin: 120,
}

export const MIN_IDLE_SEC = 15

/** Entries and away periods older than this are deleted automatically (about 6 months). */
export const RETENTION_DAYS = 183

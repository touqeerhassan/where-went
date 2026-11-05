// Domain model. Plain JSON-serialisable data so it can live in chrome.storage.local later.

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

/** A period the user was away (idle). Never counted as tracked time. */
export interface AwayPeriod {
  id: string
  start: number
  end: number
}

/** The live timer. `runningSince` is null while paused. */
export interface Session {
  projectId: string
  taskId: string | null
  startedAt: number
  accumulatedMs: number
  runningSince: number | null
}

export type ReturnBehavior = 'ask' | 'auto'

export interface Settings {
  /** Minutes without input before the timer stops itself. */
  idleThresholdMin: number
  onReturn: ReturnBehavior
  /** Above this many minutes away, auto-resume falls back to asking. */
  autoResumeMaxAwayMin: number
}

/** Shown when the user comes back from idle and the setting is Ask me (or the away was too long). */
export interface PendingReturn {
  awayStart: number
  returnedAt: number
  previous: { projectId: string; taskId: string | null }
  reason: 'ask' | 'too-long'
}

/** Shown after an automatic resume. */
export interface AutoResumeNotice {
  awayStart: number
  returnedAt: number
  projectId: string
  taskId: string | null
}

export interface State {
  onboarded: boolean
  projects: Project[]
  tasks: Task[]
  entries: Entry[]
  away: AwayPeriod[]
  session: Session | null
  /** Set while the user is away. `previous` is what was running when they left. */
  idle: { since: number; previous: { projectId: string; taskId: string | null } | null } | null
  settings: Settings
  pendingReturn: PendingReturn | null
  autoResumed: AutoResumeNotice | null
}

export const DEFAULT_SETTINGS: Settings = {
  idleThresholdMin: 2,
  onReturn: 'ask',
  autoResumeMaxAwayMin: 120,
}

/** Entries and away periods older than this are deleted automatically. */
export const RETENTION_DAYS = 183

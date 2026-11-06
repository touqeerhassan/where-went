/** Idle threshold choices in seconds. Developer builds add 15 s for testing. */
export function idleThresholdOptions(): number[] {
  const base = [60, 120, 180, 300, 600, 900]
  return __WW_DEV__ ? [15, ...base] : base
}

export const MAX_AWAY_OPTIONS_MIN = [30, 60, 120, 240, 480]

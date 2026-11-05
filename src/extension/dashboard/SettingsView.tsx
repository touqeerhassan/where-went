import { useId } from 'react'
import { DownloadSimpleIcon, HardDriveIcon, TrashSimpleIcon } from '@phosphor-icons/react'
import { useWherewent } from '../../store'
import type { State } from '../../types'
import { formatDuration } from '../../lib/time'
import { ChoiceCard } from '../Onboarding'
import { Button } from '../ui'

const THRESHOLDS = [1, 2, 3, 5, 10, 15]
const MAX_AWAY = [30, 60, 120, 240, 480]

export function SettingsView({ state, onExport }: { state: State; onExport: (f: 'csv' | 'json') => void }) {
  const [, store] = useWherewent()
  const s = state.settings
  const id = useId()
  const auto = s.onReturn === 'auto'

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <section aria-labelledby={`${id}-idle`} className="rounded-lg border border-line bg-surface">
        <h2 id={`${id}-idle`} className="border-b border-line px-4 py-3 text-[13px] font-semibold">
          Idle and return
        </h2>
        <div className="flex flex-col gap-5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <label htmlFor={`${id}-th`} className="text-sm font-medium">
                Idle threshold
              </label>
              <p id={`${id}-th-h`} className="text-[12px] text-ink-2">
                Stop the timer after this long without keyboard or mouse input.
              </p>
            </div>
            <select
              id={`${id}-th`}
              aria-describedby={`${id}-th-h`}
              value={s.idleThresholdMin}
              onChange={(e) => store.updateSettings({ idleThresholdMin: Number(e.target.value) })}
              className="tnum h-9 rounded-md border border-line-strong bg-surface px-2 text-sm"
            >
              {THRESHOLDS.map((m) => (
                <option key={m} value={m}>
                  {m} minute{m === 1 ? '' : 's'}
                  {m === 2 ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">On return from idle</legend>
            <p className="mb-2 text-[12px] text-ink-2">Time while you were away is never tracked, whichever you choose.</p>
            <div className="grid gap-2 @2xl:grid-cols-2">
              <ChoiceCard name={`${id}-ret`} checked={!auto} onChange={() => store.updateSettings({ onReturn: 'ask' })} title="Ask me" badge="Default">
                A small window asks: resume, pick another, or stay stopped.
              </ChoiceCard>
              <ChoiceCard name={`${id}-ret`} checked={auto} onChange={() => store.updateSettings({ onReturn: 'auto' })} title="Auto-resume">
                Restart the same project and task, then tell you it did.
              </ChoiceCard>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={auto ? '' : 'opacity-60'}>
              <label htmlFor={`${id}-max`} className="text-sm font-medium">
                Don't auto-resume if away longer than
              </label>
              <p id={`${id}-max-h`} className="text-[12px] text-ink-2">
                {auto ? 'Past this, it falls back to asking you.' : 'Only applies when Auto-resume is on.'}
              </p>
            </div>
            <select
              id={`${id}-max`}
              aria-describedby={`${id}-max-h`}
              disabled={!auto}
              value={s.autoResumeMaxAwayMin}
              onChange={(e) => store.updateSettings({ autoResumeMaxAwayMin: Number(e.target.value) })}
              className="tnum h-9 rounded-md border border-line-strong bg-surface px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {MAX_AWAY.map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m * 60_000).replace(' 00m', '')}
                  {m === 120 ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section aria-labelledby={`${id}-data`} className="rounded-lg border border-line bg-surface">
        <h2 id={`${id}-data`} className="border-b border-line px-4 py-3 text-[13px] font-semibold">
          Your data
        </h2>
        <div className="flex flex-col gap-4 p-4">
          <p className="flex gap-2.5 text-[13px] leading-relaxed text-ink-2">
            <HardDriveIcon size={18} className="mt-0.5 shrink-0 text-primary-ink" aria-hidden="true" />
            Everything is stored in this browser profile. Nothing is sent anywhere and there is no account.
          </p>
          <p className="flex gap-2.5 rounded-md bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
            <TrashSimpleIcon size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            <span>
              <span className="font-medium text-ink">Entries older than 6 months are deleted automatically.</span> Export first if you want to keep
              them. This cannot be turned off.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onExport('csv')}>
              <DownloadSimpleIcon size={16} aria-hidden="true" /> Export CSV
            </Button>
            <Button onClick={() => onExport('json')}>
              <DownloadSimpleIcon size={16} aria-hidden="true" /> Export JSON
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

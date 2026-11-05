import { useId, useRef, useState, useEffect, type ReactNode } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, HardDriveIcon, HourglassMediumIcon, PlusIcon, StackIcon, XIcon } from '@phosphor-icons/react'
import { useWherewent } from '../store'
import { PROJECT_COLORS, type ProjectColor, type ReturnBehavior } from '../types'
import { Button, IconButton, LogoMark, ProjectDot, cx } from './ui'

type Draft = { key: number; name: string; color: ProjectColor }

/** First run, three steps, all inside the 380 x 560 popup. */
export function Onboarding() {
  const [, store] = useWherewent()
  const [step, setStep] = useState(0)
  const [drafts, setDrafts] = useState<Draft[]>([
    { key: 0, name: '', color: PROJECT_COLORS[0] },
    { key: 1, name: '', color: PROJECT_COLORS[1] },
    { key: 2, name: '', color: PROJECT_COLORS[2] },
  ])
  const [onReturn, setOnReturn] = useState<ReturnBehavior>('ask')
  const [threshold, setThreshold] = useState(2)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const named = drafts.filter((d) => d.name.trim())

  // Move focus to the step heading so screen readers announce the new step.
  const prevStep = useRef(step)
  useEffect(() => {
    if (prevStep.current === step) return
    prevStep.current = step
    headingRef.current?.focus()
  }, [step])

  const finish = () =>
    store.completeOnboarding({
      projects: named.map(({ name, color }) => ({ name, color })),
      settings: { onReturn, idleThresholdMin: threshold },
    })

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        {step > 0 ? (
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setStep(step - 1)}>
            <ArrowLeftIcon size={14} aria-hidden="true" /> Back
          </Button>
        ) : (
          <span className="flex items-center gap-1.5 font-display text-[17px] font-semibold">
            <LogoMark /> Wherewent
          </span>
        )}
        <p className="tnum text-[12px] text-ink-3" aria-live="polite">
          Step {step + 1} of 3
        </p>
      </div>
      <div className="flex gap-1 px-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx('h-1 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-surface-3')} />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-6 pb-4">
        {step === 0 && (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-[28px] leading-[1.1] font-semibold tracking-[-0.01em]">
              Know where the time went.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              A timer for people running several projects at once, that stops itself when you walk away.
            </p>
            <ul className="mt-6 flex flex-col gap-4">
              <Point icon={<StackIcon size={18} />} title="One timer, many projects">
                Start, switch or stop in one tap from the toolbar.
              </Point>
              <Point icon={<HourglassMediumIcon size={18} />} title="Stops when you go idle">
                Away time is never counted. You decide what happens when you return.
              </Point>
              <Point icon={<HardDriveIcon size={18} />} title="Stays in this browser">
                No account, no sync, no analytics. Export whenever you like.
              </Point>
            </ul>
          </>
        )}

        {step === 1 && (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-[24px] leading-tight font-semibold">
              What are you juggling?
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">Add the projects you switch between. Clients, your own product, admin.</p>
            <ul className="mt-4 flex flex-col gap-2">
              {drafts.map((d, i) => (
                <DraftRow
                  key={d.key}
                  draft={d}
                  index={i}
                  autoFocus={i === 0}
                  onChange={(name) => setDrafts(drafts.map((x) => (x.key === d.key ? { ...x, name } : x)))}
                  onRemove={drafts.length > 1 ? () => setDrafts(drafts.filter((x) => x.key !== d.key)) : undefined}
                />
              ))}
            </ul>
            {drafts.length < 8 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 self-start"
                onClick={() =>
                  setDrafts([...drafts, { key: Date.now(), name: '', color: PROJECT_COLORS[drafts.length % PROJECT_COLORS.length] }])
                }
              >
                <PlusIcon size={14} aria-hidden="true" /> Add another
              </Button>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-[24px] leading-tight font-semibold">
              When you step away
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              After a few minutes without keyboard or mouse input, the timer stops on its own. Away time is not tracked.
            </p>
            <label className="mt-4 flex items-center justify-between gap-3 text-[13px] font-medium">
              Stop after
              <select
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="tnum h-9 rounded-md border border-line-strong bg-surface px-2 text-sm"
              >
                {[1, 2, 3, 5, 10, 15].map((m) => (
                  <option key={m} value={m}>
                    {m} min idle
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="mt-4">
              <legend className="mb-2 text-[13px] font-medium">When you come back</legend>
              <div className="flex flex-col gap-2">
                <ChoiceCard name="onret" checked={onReturn === 'ask'} onChange={() => setOnReturn('ask')} title="Ask me" badge="Default">
                  Show a small prompt: resume, pick something else, or stay stopped.
                </ChoiceCard>
                <ChoiceCard name="onret" checked={onReturn === 'auto'} onChange={() => setOnReturn('auto')} title="Auto-resume">
                  Pick up where you left off and tell me. Long absences still ask.
                </ChoiceCard>
              </div>
            </fieldset>
            <p className="mt-3 text-[12px] text-ink-3">You can change both later in Settings.</p>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-line px-4 py-3">
        {step < 2 ? (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={step === 1 && named.length === 0}
            onClick={() => setStep(step + 1)}
          >
            {step === 0 ? 'Set up projects' : `Continue with ${named.length} project${named.length === 1 ? '' : 's'}`}
            <ArrowRightIcon size={16} aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="primary" size="lg" className="w-full" onClick={finish}>
            Start tracking
          </Button>
        )}
      </div>
    </div>
  )
}

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-ink" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[13px] leading-relaxed text-ink-2">{children}</span>
      </span>
    </li>
  )
}

function DraftRow({
  draft,
  index,
  autoFocus,
  onChange,
  onRemove,
}: {
  draft: Draft
  index: number
  autoFocus?: boolean
  onChange: (name: string) => void
  onRemove?: () => void
}) {
  const id = useId()
  const placeholders = ['e.g. Client portal', 'e.g. Own product', 'e.g. Admin & invoicing', 'Project name']
  return (
    <li className="flex items-center gap-2">
      <ProjectDot color={draft.color} size={10} />
      <label htmlFor={id} className="sr-only">
        Project {index + 1}
      </label>
      <input
        id={id}
        autoFocus={autoFocus}
        value={draft.name}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholders[Math.min(index, 3)]}
        className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2.5 text-sm placeholder:text-ink-3"
      />
      {onRemove && (
        <IconButton label={`Remove project ${index + 1}`} onClick={onRemove}>
          <XIcon size={14} />
        </IconButton>
      )}
    </li>
  )
}

export function ChoiceCard({
  name,
  checked,
  onChange,
  title,
  badge,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  title: string
  badge?: string
  children: ReactNode
}) {
  return (
    <label
      className={cx(
        'flex gap-3 rounded-lg border p-3 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
        checked ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 size-4 accent-[var(--ww-primary)]" />
      <span>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {badge && <span className="rounded-sm bg-surface-3 px-1.5 py-px text-2xs font-medium text-ink-2">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-2">{children}</span>
      </span>
    </label>
  )
}

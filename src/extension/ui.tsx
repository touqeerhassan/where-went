import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { ProjectColor } from '../types'

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

export const projectColorVar = (c: ProjectColor) => `var(--ww-p-${c})`

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'away'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover border border-transparent',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-surface text-danger border border-line-strong hover:bg-danger-soft',
  away: 'bg-away-soft text-away border border-away-line hover:brightness-95',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3 text-sm gap-2 rounded-md',
  lg: 'h-12 px-4 text-[15px] gap-2 rounded-lg font-semibold',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  )
})

/** Icon-only button. `label` is required and becomes the accessible name + tooltip. */
export function IconButton({
  label,
  children,
  className,
  ...rest
}: Omit<ButtonProps, 'children'> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-8 items-center justify-center rounded-md text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-45',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function ProjectDot({ color, size = 8, className }: { color: ProjectColor; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block shrink-0 rounded-full', className)}
      style={{ width: size, height: size, background: projectColorVar(color) }}
    />
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-line-strong bg-surface px-1 font-sans text-2xs font-medium text-ink-2">
      {children}
    </kbd>
  )
}

/** Small uppercase section label used across dense surfaces. */
export function Eyebrow({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cx('text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase', className)}>
      {children}
    </h2>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/** Radio-group based segmented control: arrow keys move, Tab enters/leaves once. */
export function Segmented<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  className,
}: {
  name: string
  label: string
  value: T
  options: SegmentOption<T>[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <fieldset className={cx('inline-flex rounded-md border border-line bg-surface-2 p-0.5', className)}>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={cx(
            'relative inline-flex h-7 items-center rounded-[5px] px-3 text-[13px] font-medium transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring',
            value === o.value ? 'bg-surface text-ink shadow-[0_1px_1px_rgb(0_0_0/0.08)] ring-1 ring-line' : 'text-ink-2 hover:text-ink',
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-display text-[17px] font-semibold tracking-[-0.01em] text-ink', className)}>
      <LogoMark />
      Wherewent
    </span>
  )
}

/** Mark: a clock face split into a tracked arc and a hatched away gap. */
export function LogoMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="var(--ww-line-strong)" strokeWidth="1.5" />
      <path d="M10 1.75 A8.25 8.25 0 1 1 2.2 12.7" fill="none" stroke="var(--ww-primary)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10 10 L10 5.2 M10 10 L13.2 11.6" stroke="var(--ww-ink)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

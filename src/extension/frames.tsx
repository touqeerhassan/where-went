import type { ReactNode } from 'react'
import { LogoMark, cx } from './ui'

/** Browser toolbar strip with the extension popup hanging from its icon. */
export function PopupFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('inline-flex flex-col items-end', className)}>
      <div className="flex h-9 w-[404px] max-w-full items-center gap-2 rounded-t-lg border border-b-0 border-line bg-surface-2 px-3" aria-hidden="true">
        <span className="h-5 flex-1 rounded-full bg-surface-3" />
        <span className="inline-flex size-6 items-center justify-center rounded-md bg-surface ring-1 ring-line">
          <LogoMark size={14} />
        </span>
      </div>
      <div className="relative -mt-px mr-1 rounded-lg border border-line bg-bg shadow-window">
        <span className="absolute -top-[6px] right-[13px] size-3 rotate-45 border-t border-l border-line bg-surface" aria-hidden="true" />
        <div className="relative overflow-hidden rounded-lg">{children}</div>
      </div>
    </div>
  )
}

/** Small OS-style window, used for the return prompt. */
export function WindowFrame({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('inline-block overflow-hidden rounded-[10px] border border-line-strong bg-bg shadow-window', className)}>
      <div className="flex h-7 items-center gap-1.5 border-b border-line bg-surface-2 px-2.5" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-surface-3 ring-1 ring-line-strong" />
        <span className="size-2.5 rounded-full bg-surface-3 ring-1 ring-line-strong" />
        <span className="size-2.5 rounded-full bg-surface-3 ring-1 ring-line-strong" />
        <span className="flex-1 text-center text-[11px] font-medium text-ink-3">{title}</span>
        <span className="w-10" />
      </div>
      {children}
    </div>
  )
}

/** Full browser window with a tab and address bar, used for the dashboard. */
export function BrowserFrame({ children, className, url = 'Wherewent · Dashboard' }: { children: ReactNode; className?: string; url?: string }) {
  return (
    <div className={cx('overflow-hidden rounded-[10px] border border-line-strong bg-bg shadow-window', className)}>
      <div className="flex h-9 items-end gap-2 bg-surface-3 px-3" aria-hidden="true">
        <span className="mb-3 flex gap-1.5">
          <span className="size-2.5 rounded-full bg-surface ring-1 ring-line-strong" />
          <span className="size-2.5 rounded-full bg-surface ring-1 ring-line-strong" />
          <span className="size-2.5 rounded-full bg-surface ring-1 ring-line-strong" />
        </span>
        <span className="flex h-7 w-52 items-center gap-1.5 rounded-t-md bg-surface-2 px-2.5 text-[11px] text-ink-2">
          <LogoMark size={12} /> Dashboard
        </span>
      </div>
      <div className="flex h-8 items-center border-b border-line bg-surface-2 px-3" aria-hidden="true">
        <span className="flex h-5 flex-1 items-center rounded-full bg-surface px-3 text-[11px] text-ink-3">{url}</span>
      </div>
      {children}
    </div>
  )
}

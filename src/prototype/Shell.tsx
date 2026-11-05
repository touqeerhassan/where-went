import { useCallback, useEffect, useState } from 'react'
import { ArrowSquareOutIcon, ArrowCounterClockwiseIcon, MoonIcon } from '@phosphor-icons/react'
import { defaultStore, useWherewent } from '../store'
import type { MockStore } from '../mock/mockStore'
import { scenarioState, type ScenarioName } from '../mock/scenarios'
import { MIN } from '../lib/time'
import { Popup } from '../extension/Popup'
import { AutoResumeNotification, ReturnPrompt } from '../extension/ReturnPrompt'
import { Dashboard } from '../extension/dashboard/Dashboard'
import { BrowserFrame, PopupFrame, WindowFrame } from '../extension/frames'
import { Button, LogoMark, Segmented, cx } from '../extension/ui'
import { applyTheme, readTheme, type ThemePref } from '../extension/theme'

type Surface = 'popup' | 'return' | 'auto' | 'dashboard'

const SCREENS: { id: ScenarioName; label: string; surface: Surface; note: string }[] = [
  { id: 'onboarding', label: 'First run', surface: 'popup', note: 'Popup · 380 × 560 · first-run onboarding, 3 steps' },
  { id: 'empty', label: 'Empty state', surface: 'popup', note: 'Popup · 380 × 560 · projects set up, nothing tracked yet' },
  { id: 'idle', label: 'Popup: idle', surface: 'popup', note: 'Popup · 380 × 560 · pick project, pick or type task, Start' },
  { id: 'running', label: 'Popup: running', surface: 'popup', note: 'Popup · 380 × 560 · try "Simulate idle + return"' },
  { id: 'return', label: 'Return prompt', surface: 'return', note: 'Window · 360 × 320 · Enter resumes, P picks, Esc stays stopped' },
  { id: 'auto-resume', label: 'Auto-resume', surface: 'auto', note: 'Desktop notification + popup banner · setting: Auto-resume' },
  { id: 'dashboard', label: 'Dashboard', surface: 'dashboard', note: 'Full tab' },
]

const mock = defaultStore as MockStore

function readHash(): ScenarioName {
  const h = window.location.hash.slice(1) as ScenarioName
  return SCREENS.some((s) => s.id === h) ? h : 'idle'
}

export function Shell() {
  const [state, store] = useWherewent()
  const [screen, setScreen] = useState<ScenarioName>(readHash)
  const [surface, setSurface] = useState<Surface>(() => SCREENS.find((s) => s.id === readHash())!.surface)
  const [theme, setTheme] = useState<ThemePref>(readTheme)

  const go = useCallback((id: ScenarioName) => {
    mock.replaceState(scenarioState(id))
    setScreen(id)
    setSurface(SCREENS.find((s) => s.id === id)!.surface)
    if (window.location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`)
  }, [])

  useEffect(() => {
    go(readHash())
    const onHash = () => go(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [go])

  useEffect(() => applyTheme(theme), [theme])

  // Exercise the real store rules: stop on idle 14 min ago, return now.
  const simulateIdle = async () => {
    const now = Date.now()
    await store.goIdle(now - 14 * MIN)
    await store.returnFromIdle(now)
    const s = store.getState()
    if (s.pendingReturn) setSurface('return')
    else setSurface('popup')
  }

  const current = SCREENS.find((s) => s.id === screen)!
  const canSimulate = !!state.session?.runningSince && (surface === 'popup' || surface === 'dashboard')

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#stage" className="sr-only-focusable fixed top-2 left-2 z-50 rounded-md bg-surface px-3 py-2 text-sm shadow-window">
        Skip to screen
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <LogoMark /> Wherewent <span className="font-normal text-ink-3">prototype</span>
          </p>
          <nav aria-label="Screens" className="order-last w-full overflow-x-auto lg:order-none lg:w-auto lg:flex-1">
            <ul className="flex gap-1">
              {SCREENS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={screen === s.id ? 'page' : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      go(s.id)
                    }}
                    className={cx(
                      'inline-flex h-8 items-center rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors duration-150',
                      screen === s.id ? 'bg-ink font-medium text-bg' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
              <li className="ml-1 border-l border-line pl-2">
                <a href="/src/landing/" className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] whitespace-nowrap text-ink-2 hover:bg-surface-2 hover:text-ink">
                  Landing page <ArrowSquareOutIcon size={13} aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href="/src/landing/privacy.html" className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] whitespace-nowrap text-ink-2 hover:bg-surface-2 hover:text-ink">
                  Privacy page <ArrowSquareOutIcon size={13} aria-hidden="true" />
                </a>
              </li>
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <MoonIcon size={14} className="text-ink-3" aria-hidden="true" />
            <Segmented
              name="theme"
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-[12px] text-ink-2">
        <span className="tnum">{current.note}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-ink-3">
            Setting: <span className="font-medium text-ink-2">{state.settings.onReturn === 'ask' ? 'Ask me' : 'Auto-resume'}</span>
          </span>
          <Button size="sm" onClick={() => store.updateSettings({ onReturn: state.settings.onReturn === 'ask' ? 'auto' : 'ask' })}>
            Toggle return setting
          </Button>
          <Button size="sm" disabled={!canSimulate} onClick={simulateIdle} title={canSimulate ? undefined : 'Start a timer first'}>
            Simulate idle 14m + return
          </Button>
          <Button size="sm" variant="ghost" onClick={() => go(screen)}>
            <ArrowCounterClockwiseIcon size={14} aria-hidden="true" /> Reset screen
          </Button>
        </span>
      </div>

      <main id="stage" tabIndex={-1} className={cx('flex flex-1 justify-center', surface === 'dashboard' ? 'p-0 md:p-6' : 'items-start p-6 md:p-10')}>
        {surface === 'popup' && (
          <PopupFrame>
            <Popup onOpenDashboard={() => setSurface('dashboard')} />
          </PopupFrame>
        )}
        {surface === 'return' && (
          <div className="flex flex-col items-center gap-4">
            <WindowFrame title="Wherewent">
              <ReturnPrompt key={state.pendingReturn?.returnedAt} onDone={() => setSurface('popup')} />
            </WindowFrame>
            {!state.pendingReturn && (
              <Button size="sm" onClick={() => setSurface('popup')}>
                Open popup
              </Button>
            )}
          </div>
        )}
        {surface === 'auto' && (
          <div className="flex w-full max-w-4xl flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center">
            <figure className="flex flex-col items-center gap-2">
              {state.autoResumed ? (
                <AutoResumeNotification onSwitch={() => setSurface('popup')} onDismiss={() => store.dismissAutoResumeNotice()} />
              ) : (
                <p className="w-[360px] rounded-xl border border-dashed border-line-strong p-4 text-center text-[13px] text-ink-3">Notification dismissed.</p>
              )}
              <figcaption className="text-[12px] text-ink-3">Desktop notification</figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-2">
              <PopupFrame>
                <Popup onOpenDashboard={() => setSurface('dashboard')} />
              </PopupFrame>
              <figcaption className="text-[12px] text-ink-3">Popup banner when opened</figcaption>
            </figure>
          </div>
        )}
        {surface === 'dashboard' && (
          <BrowserFrame className="flex w-full max-w-[1400px] flex-col rounded-none border-x-0 md:rounded-[10px] md:border-x [&>div:last-child]:flex-1">
            <Dashboard />
          </BrowserFrame>
        )}
      </main>
    </div>
  )
}

/**
 * Product visuals for the landing page: the real extension components, each
 * with its own isolated mock store, rendered into reserved slots in the static
 * HTML. They are `inert` (illustrations, not controls) so keyboard users are
 * not dragged through a whole dashboard; every figure has a text caption.
 */
import { StrictMode, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { StoreProvider } from '../store'
import { createMockStore } from '../mock/mockStore'
import { scenarioState, type ScenarioName } from '../mock/scenarios'
import { Popup } from '../extension/Popup'
import { AutoResumeNotification, ReturnPrompt } from '../extension/ReturnPrompt'
import { Dashboard } from '../extension/dashboard/Dashboard'
import { BrowserFrame, PopupFrame, WindowFrame } from '../extension/frames'
import { HOUR, MIN, startOfDay } from '../lib/time'

// Fixed demo clock: today at 3:42 PM, so every visitor sees a full working day.
const DEMO_NOW = startOfDay(Date.now()) + 15 * HOUR + 42 * MIN

function storeFor(name: ScenarioName) {
  return createMockStore(scenarioState(name, DEMO_NOW), () => DEMO_NOW)
}

/** Renders `children` at a fixed design size and scales it down to fit its slot. */
function Scaled({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])
  return (
    // overflow: clip keeps the unscaled layout box from widening the page on phones;
    // the clip margin leaves room for window shadows.
    <div ref={ref} className="w-full" style={{ height: height * scale, overflow: 'clip', overflowClipMargin: 24 }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}

const visuals: Record<string, () => ReactNode> = {
  hero: () => (
    <Scaled width={560} height={640}>
      <div className="relative h-[640px] w-[560px]">
        <div className="absolute top-0 right-0">
          <StoreProvider store={storeFor('running')}>
            <PopupFrame>
              <Popup frozenAt={DEMO_NOW} />
            </PopupFrame>
          </StoreProvider>
        </div>
        <div className="absolute bottom-0 left-0">
          <StoreProvider store={storeFor('return')}>
            <WindowFrame title="Wherewent">
              <ReturnPrompt autoFocus={false} />
            </WindowFrame>
          </StoreProvider>
        </div>
      </div>
    </Scaled>
  ),
  'popup-idle': () => (
    <Scaled width={404} height={600}>
      <StoreProvider store={storeFor('idle')}>
        <PopupFrame>
          <Popup frozenAt={DEMO_NOW} />
        </PopupFrame>
      </StoreProvider>
    </Scaled>
  ),
  return: () => (
    <Scaled width={362} height={540}>
      <div className="flex flex-col gap-6">
        <StoreProvider store={storeFor('return')}>
          <WindowFrame title="Wherewent">
            <ReturnPrompt autoFocus={false} />
          </WindowFrame>
        </StoreProvider>
        <StoreProvider store={storeFor('auto-resume')}>
          <AutoResumeNotification />
        </StoreProvider>
      </div>
    </Scaled>
  ),
  dashboard: () => (
    <Scaled width={1280} height={900}>
      <StoreProvider store={storeFor('dashboard')}>
        <BrowserFrame className="h-[900px]">
          <Dashboard frozenAt={DEMO_NOW} />
        </BrowserFrame>
      </StoreProvider>
    </Scaled>
  ),
}

function mount(slot: HTMLElement) {
  const render = visuals[slot.dataset.visual ?? '']
  if (!render) return
  slot.inert = true
  createRoot(slot).render(<StrictMode>{render()}</StrictMode>)
}

// Hero renders immediately; the rest render shortly before they scroll into view.
// Slots reserve their size with aspect-ratio in the HTML, so nothing shifts.
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      io.unobserve(e.target)
      mount(e.target as HTMLElement)
    }
  },
  { rootMargin: '600px 0px' },
)
for (const slot of document.querySelectorAll<HTMLElement>('[data-visual]')) {
  if (slot.dataset.visual === 'hero') mount(slot)
  else io.observe(slot)
}

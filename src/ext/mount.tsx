import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import { StoreProvider, type WherewentStore } from '../store'
import { createChromeStore } from './chromeStore'

/** Hydrate the chrome.storage-backed store, then render. */
export async function mount(render: (store: WherewentStore) => ReactNode) {
  const root = createRoot(document.getElementById('root')!)
  try {
    const store = await createChromeStore()
    root.render(
      <StrictMode>
        <StoreProvider store={store}>{render(store)}</StoreProvider>
      </StrictMode>,
    )
  } catch (err) {
    root.render(
      <p role="alert" style={{ padding: 16, font: '13px system-ui' }}>
        Wherewent could not load its data: {err instanceof Error ? err.message : String(err)}
      </p>,
    )
  }
}

export const dashboardUrl = () => chrome.runtime.getURL('dashboard.html')

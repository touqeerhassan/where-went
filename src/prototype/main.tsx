import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import { StoreProvider } from '../store'
import { createMockStore } from '../mock/mockStore'
import { Shell } from './Shell'

const mock = createMockStore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider store={mock}>
      <Shell mock={mock} />
    </StoreProvider>
  </StrictMode>,
)

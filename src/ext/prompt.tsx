import { useEffect, useState } from 'react'
import { ReturnPrompt } from '../extension/ReturnPrompt'
import { useWherewent } from '../store'
import { mount } from './mount'

type Mode = 'return' | 'pick' | 'switch'
const readMode = (): Mode => {
  const h = location.hash.slice(1)
  return h === 'pick' || h === 'switch' ? h : 'return'
}

function PromptWindow() {
  const [state] = useWherewent()
  const [mode, setMode] = useState<Mode>(readMode)
  const pending = state.pendingResume?.returnedAt != null

  // The worker re-targets this window with a new #mode instead of opening another one.
  useEffect(() => {
    const onHash = () => setMode(readMode())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Resolved somewhere else (notification button, popup, manual start): nothing left to ask.
  useEffect(() => {
    if (mode !== 'switch' && !pending) window.close()
  }, [mode, pending])

  return <ReturnPrompt key={mode} mode={mode} fill onDone={() => window.close()} />
}

void mount(() => <PromptWindow />)

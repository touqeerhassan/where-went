// Shared by the landing page and the privacy policy. First-party only, no network.
import '../styles/tokens.css'
import { applyTheme, readTheme, type ThemePref } from '../extension/theme'

function effective(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function initThemeToggle() {
  const btn = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')
  if (!btn) return
  const sync = () => {
    const dark = effective(readTheme()) === 'dark'
    btn.setAttribute('aria-pressed', String(dark))
    btn.setAttribute('aria-label', dark ? 'Dark theme on. Switch to light theme' : 'Light theme on. Switch to dark theme')
  }
  btn.addEventListener('click', () => {
    applyTheme(effective(readTheme()) === 'dark' ? 'light' : 'dark')
    sync()
  })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync)
  sync()
}

initThemeToggle()

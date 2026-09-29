/**
 * Theme preference.
 *
 * Three states, not two: `system`, `light`, and `dark`. The default follows
 * `prefers-color-scheme` and keeps following it while the user has not made a
 * choice, so a device that switches to dark at sunset switches with it. An
 * explicit choice is remembered and stops tracking the system, because someone
 * who picked a theme meant it.
 *
 * Applied by writing `data-theme` on `<html>`. A class was the alternative and
 * is worse here: it is the token values in `index.css` that differ, and
 * keying off an attribute on the root keeps every component reading the same
 * semantic names with no `dark:` variants anywhere.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'ai-todo:theme:v1'

const ThemeContext = createContext<{
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (value: ThemePreference) => void
  toggle: () => void
} | null>(null)

/**
 * Read through a try/catch rather than `task-repository.ts`.
 *
 * The rule that storage lives in one place is about task data, which needs
 * quota recovery, per-record validation, and failure surfaced in the UI. A
 * display preference needs none of that: if storage is blocked the worst case
 * is that the theme resets, which is not worth an error message. Still guarded,
 * because Safari private mode throws on `setItem`.
 */
function readStored(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : null
  } catch {
    return null
  }
}

function writeStored(value: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Preference simply will not persist; the toggle still works this session.
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStored() ?? 'system')
  const [systemValue, setSystemValue] = useState<ResolvedTheme>(() => systemTheme())

  // Only meaningful while following the system; the listener is the reason
  // `system` is a real state rather than a one-time read at mount.
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const onChange = (event: MediaQueryListEvent) => {
      setSystemValue(event.matches ? 'dark' : 'light')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = preference === 'system' ? systemValue : preference

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value)
    writeStored(value)
  }, [])

  const toggle = useCallback(() => {
    setPreferenceState((current) => {
      // Toggling out of `system` needs an answer about the *current* resolved
      // theme, not the stored string: from `system` on a dark device, the
      // first press must go to light, which `current === 'system'` alone
      // cannot say.
      const next: ThemePreference = resolve(current) === 'dark' ? 'light' : 'dark'
      writeStored(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider')
  return context
}

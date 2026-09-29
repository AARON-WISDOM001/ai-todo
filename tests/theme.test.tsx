/**
 * Theme switching.
 *
 * Described as behaviour, not implementation: what a person sees changes, the
 * choice survives a reload, and a device that switches at sunset is followed
 * until the person says otherwise.
 *
 * `matchMedia` is stubbed because jsdom reports every media query as
 * unmatched and has no listener support, so `prefers-color-scheme` cannot be
 * exercised otherwise. Each test sets the system value explicitly rather than
 * relying on the host machine.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../src/App.tsx'
import { ThemeProvider, useTheme } from '../src/lib/theme.tsx'

type Listener = (event: MediaQueryListEvent) => void

const media = { matches: false, listeners: new Set<Listener>() }

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes('dark') ? media.matches : false
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, handler: Listener) => media.listeners.add(handler),
      removeEventListener: (_: string, handler: Listener) => media.listeners.delete(handler),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function toggleTheme() {
  return screen.getByRole('button', { name: /dark mode/i })
}

/** Simulates the OS switching appearance, which must reach an undecided app. */
function systemChangesToDark() {
  act(() => {
    media.matches = true
    for (const listener of media.listeners) {
      listener({ matches: true } as MediaQueryListEvent)
    }
  })
}

beforeEach(() => {
  media.matches = false
  media.listeners.clear()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  installMatchMedia()
})

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('the dark mode toggle', () => {
  it('starts light on a device that reports a light appearance', () => {
    render(<App />)

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(toggleTheme()).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches the whole app to dark and marks the control as on', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(toggleTheme())

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(toggleTheme()).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches back to light on a second press', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(toggleTheme())
    await user.click(toggleTheme())

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('remembers the choice after a reload', async () => {
    const user = userEvent.setup()
    const first = render(<App />)

    await user.click(toggleTheme())
    first.unmount()

    render(<App />)

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('follows the system appearance until the person decides otherwise', () => {
    render(<App />)
    expect(document.documentElement.dataset.theme).toBe('light')

    systemChangesToDark()

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('stops following the system once an explicit choice is made', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(toggleTheme())
    expect(document.documentElement.dataset.theme).toBe('dark')

    // The OS now says light. The person said dark; the person wins.
    act(() => {
      media.matches = false
      for (const listener of media.listeners) {
        listener({ matches: false } as MediaQueryListEvent)
      }
    })

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('works from inside a dialog as well as the sidebar', async () => {
    const user = userEvent.setup()
    function Probe() {
      const { resolved, toggle } = useTheme()
      return (
        <button type="button" onClick={toggle}>
          {resolved === 'dark' ? 'light now' : 'dark now'}
        </button>
      )
    }
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'dark now' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('turns the theme to light on the first press when the system is already dark', async () => {
    // Toggling out of `system` has to answer from the resolved theme, not the
    // stored string. An implementation that compared the stored `'system'`
    // against `'dark'` would get this wrong and appear to do nothing, which is
    // a control that looks broken.
    media.matches = true
    const user = userEvent.setup()
    render(<App />)

    expect(document.documentElement.dataset.theme).toBe('dark')

    await user.click(toggleTheme())

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('still switches when storage is unavailable, it just will not remember', async () => {
    const user = userEvent.setup()
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    render(<App />)
    await user.click(toggleTheme())

    expect(document.documentElement.dataset.theme).toBe('dark')
    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('ignores a corrupt stored value rather than failing to start', () => {
    window.localStorage.setItem('ai-todo:theme:v1', 'not-a-theme')
    render(<App />)

    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

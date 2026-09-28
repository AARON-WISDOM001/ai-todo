/**
 * Shared modal behaviour: focus trap, Escape to close, focus restoration, and
 * background scroll lock without layout shift.
 *
 * Extracted so the command dialog and the mobile navigation drawer cannot drift
 * apart — a drawer that traps focus slightly differently from a dialog is the
 * kind of inconsistency nobody notices until it breaks keyboard access.
 */

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface ModalBehaviourOptions {
  open: boolean
  onClose: () => void
  /** Element that receives focus when the modal opens; the panel itself if omitted. */
  panelRef: React.RefObject<HTMLElement | null>
  /** When true, the modal is treated as non-blocking (e.g. a non-modal drawer). */
  trapFocus?: boolean
}

export function useModalBehaviour({ open, onClose, panelRef, trapFocus = true }: ModalBehaviourOptions) {
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const focusables = (): HTMLElement[] => {
    if (!panelRef.current) return []
    return Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    )
  }

  // Move focus in on open, and hand it back to the trigger on close.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null

    const target = focusables()[0] ?? panelRef.current
    target?.focus()

    return () => {
      previouslyFocused.current?.focus?.()
    }
    // `focusables` is intentionally not a dependency: it closes over the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelRef])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (!trapFocus || event.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }

      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose, panelRef, trapFocus])

  // Lock background scroll, compensating for the scrollbar's width so the page
  // behind does not shift sideways when it disappears.
  useEffect(() => {
    if (!open) return
    const { body } = document
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth

    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`

    return () => {
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
    }
  }, [open])
}

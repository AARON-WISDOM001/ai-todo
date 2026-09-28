import { useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn.ts'
import { useModalBehaviour } from '../../lib/use-modal.ts'
import { IconButton } from './icon-button.tsx'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** Visually hides the title while keeping it as the accessible name. */
  hideTitle?: boolean
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Where the panel is anchored. Overlays suit both the command bar and editors. */
  position?: 'center' | 'top'
  /** Set false for destructive confirmations where a stray click is costly. */
  closeOnBackdrop?: boolean
}

/**
 * An accessible modal.
 *
 * Implements the four things a dialog must do and that are easy to get wrong:
 * trap Tab inside the panel, close on Escape, move focus in on open, and return
 * focus to the trigger on close. Background scrolling is locked while open.
 */
export function Dialog({
  open,
  onClose,
  title,
  hideTitle,
  description,
  children,
  footer,
  className,
  position = 'center',
  closeOnBackdrop = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useModalBehaviour({ open, onClose, panelRef })

  if (!open) return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex justify-center p-4',
        position === 'center' ? 'items-center' : 'items-start pt-[12vh]',
      )}
    >
      <div
        className="absolute inset-0 animate-[var(--animate-fade-in)] bg-ink/25 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={hideTitle ? title : undefined}
        aria-labelledby={hideTitle ? undefined : 'dialog-title'}
        tabIndex={-1}
        className={cn(
          'relative flex w-full flex-col overflow-hidden bg-surface shadow-overlay',
          'animate-[var(--animate-scale-in)] rounded-xl',
          position === 'center' ? 'max-w-lg' : 'max-w-xl',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h2 id="dialog-title" className={cn('text-[15px] font-semibold', hideTitle && 'sr-only')}>
              {title}
            </h2>
            {description && <p className="mt-1 text-[13px] text-ink-secondary">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-1.5">
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </IconButton>
        </div>

        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-5">{children}</div>

        {footer && (
          <div className="mt-5 flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

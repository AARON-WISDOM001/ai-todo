import type { ReactNode } from 'react'

import { cn } from '../../lib/cn.ts'
import { PRIORITIES, type Priority } from '../../../shared/task.ts'
import { type DueTone, isValidDateKey } from '../../../shared/dates.ts'
import { formatDueDate } from '../../../shared/dates.ts'

/* -------------------------------------------------------------------------- */
/*  Priority                                                                   */
/* -------------------------------------------------------------------------- */

export const PRIORITY_META: Record<Priority, { label: string; dot: string; text: string; chip: string }> = {
  high: {
    label: 'High',
    dot: 'bg-urgent',
    text: 'text-urgent',
    chip: 'bg-urgent-subtle text-urgent',
  },
  medium: {
    label: 'Medium',
    dot: 'bg-caution',
    text: 'text-caution',
    chip: 'bg-caution-subtle text-caution',
  },
  low: {
    label: 'Low',
    dot: 'bg-ink-disabled',
    text: 'text-ink-tertiary',
    chip: 'bg-surface-sunken text-ink-secondary',
  },
}

/**
 * Priority marker.
 *
 * Renders a dot *and* the word, never the dot alone — colour is the fast channel
 * but the label is what makes the state legible to everyone and readable by
 * assistive technology.
 */
export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const meta = PRIORITY_META[priority]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap',
        meta.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Due date                                                                   */
/* -------------------------------------------------------------------------- */

const DUE_TONES: Record<DueTone, string> = {
  overdue: 'text-urgent',
  today: 'text-ink',
  soon: 'text-ink-secondary',
  upcoming: 'text-ink-tertiary',
  none: 'text-ink-tertiary',
}

export function DueDateBadge({
  dueDate,
  completed = false,
  className,
}: {
  dueDate: string | null
  completed?: boolean
  className?: string
}) {
  if (!dueDate || !isValidDateKey(dueDate)) return null
  const formatted = formatDueDate(dueDate)
  if (!formatted) return null

  // A finished task's date is history, not a warning.
  const tone = completed ? 'upcoming' : formatted.tone

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', DUE_TONES[tone], className)}
      title={formatted.relative ? `${formatted.iso} · ${formatted.relative}` : formatted.iso}
    >
      <svg viewBox="0 0 12 12" className="size-3 shrink-0" fill="none" aria-hidden="true">
        <rect x="1.75" y="2.75" width="8.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
        <path d="M1.75 5.25h8.5M4 1.75v2M8 1.75v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      {formatted.label}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Source + generic badges                                                    */
/* -------------------------------------------------------------------------- */

/** Marks a task as AI-generated so provenance stays visible after creation. */
export function AiBadge({ className, label = 'AI' }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-xs bg-accent-subtle px-1.5 py-px',
        'text-[10px] font-semibold tracking-[0.06em] text-accent uppercase',
        className,
      )}
    >
      <svg viewBox="0 0 12 12" className="size-2.5" fill="currentColor" aria-hidden="true">
        <path d="M6 0.75 7.1 4.2 10.5 5.3 7.1 6.4 6 9.85 4.9 6.4 1.5 5.3 4.9 4.2z" />
      </svg>
      {label}
    </span>
  )
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  className?: string
  children: ReactNode
}) {
  const tones = {
    neutral: 'bg-surface-sunken text-ink-secondary',
    accent: 'bg-accent-subtle text-accent',
    success: 'bg-success-subtle text-success',
    warning: 'bg-caution-subtle text-caution',
    danger: 'bg-urgent-subtle text-urgent',
  } as const
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Keyboard hint rendered inside buttons and command surfaces. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line',
        'bg-surface px-1 font-sans text-[11px] font-medium text-ink-tertiary',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export { PRIORITIES }

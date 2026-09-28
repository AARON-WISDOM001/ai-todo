import type { ReactNode } from 'react'

import { cn } from '../../lib/cn.ts'

/**
 * The empty state.
 *
 * Every one of these has a real reason to be empty — a brand-new account, a
 * filter that matched nothing, a cleared list — so each gets its own message
 * and its own next action instead of a generic "no data" panel.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-6 py-10' : 'gap-3 px-8 py-20',
        className,
      )}
    >
      {icon && (
        <div className="mb-1 grid size-11 place-items-center rounded-lg border border-line bg-surface text-ink-tertiary">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && (
        <p className="max-w-xs text-[13px] leading-relaxed text-ink-secondary">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Placeholder rows shown while an AI request is in flight. */
export function SkeletonRows({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-1 py-2.5">
          <div className="skeleton size-[18px] rounded-[5px]" />
          <div className="flex-1 space-y-1.5">
            <div
              className="skeleton h-3.5"
              // Varying widths read as real content rather than a loading bar.
              style={{ width: `${[68, 84, 55, 76, 62][index % 5]}%` }}
            />
            <div className="skeleton h-2.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Inline status message.
 *
 * `assertive` for failures so a screen reader announces them immediately; polite
 * for progress, which should not interrupt whatever the user is doing.
 */
export function InlineMessage({
  tone,
  title,
  description,
  action,
  className,
}: {
  tone: 'error' | 'success' | 'info'
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  const tones = {
    error: {
      wrap: 'border-urgent/25 bg-urgent-subtle',
      icon: 'text-urgent',
      title: 'text-urgent',
    },
    success: {
      wrap: 'border-success/25 bg-success-subtle',
      icon: 'text-success',
      title: 'text-success',
    },
    info: {
      wrap: 'border-line bg-surface-sunken',
      icon: 'text-ink-secondary',
      title: 'text-ink',
    },
  } as const

  const style = tones[tone]
  const Icon = tone === 'error' ? XCircle : tone === 'success' ? CheckCircle : Info

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3', style.wrap, className)}
    >
      <Icon className={cn('mt-px size-4 shrink-0', style.icon)} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] font-medium', style.title)}>{title}</p>
        {description && (
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{description}</p>
        )}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  )
}

/* Inline SVG glyphs, sized by the caller's font size. */

function XCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.3 8.2l1.9 1.9 3.5-3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Info({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2v4M8 5.1v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

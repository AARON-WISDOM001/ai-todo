import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

import { cn } from '../../lib/cn.ts'

/* -------------------------------------------------------------------------- */
/*  Field wrapper                                                              */
/* -------------------------------------------------------------------------- */

export interface FieldProps {
  label: string
  /** Visually hides the label while keeping it as the accessible name. */
  hideLabel?: boolean
  hint?: string
  error?: string
  htmlFor: string
  children: ReactNode
  className?: string
}

/**
 * Wraps a control with its label, hint, and error message.
 *
 * Errors are wired with `aria-describedby` and `aria-invalid` by the controls
 * themselves; this component owns the visual presentation only.
 */
export function Field({ label, hideLabel, hint, error, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className={cn(
          'text-[13px] font-medium text-ink-secondary',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-tertiary">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-urgent">
          {error}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Controls                                                                   */
/* -------------------------------------------------------------------------- */

const CONTROL_BASE =
  'w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary ' +
  'transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out-soft)] ' +
  'focus:outline-none focus-visible:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-disabled'

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, 'h-9', invalid ? 'border-urgent' : 'border-line', className)}
      {...props}
    />
  )
})

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, invalid, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        'resize-y py-2 leading-relaxed',
        invalid ? 'border-urgent' : 'border-line',
        className,
      )}
      {...props}
    />
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL_BASE,
          'h-9 cursor-pointer appearance-none pr-8',
          invalid ? 'border-urgent' : 'border-line',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-ink-tertiary"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
})

/** Convenience hook for the id/label wiring every form control needs. */
export function useFieldIds(name: string) {
  const id = useId()
  return { id, name, hintId: `${id}-hint`, errorId: `${id}-error` }
}

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/cn.ts'

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent shadow-[0_8px_20px_rgba(45,41,40,0.12)] hover:bg-accent-hover active:bg-accent-hover disabled:hover:bg-accent',
  secondary:
    'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-sunken active:bg-surface-sunken',
  ghost: 'text-ink-secondary hover:bg-surface-sunken hover:text-ink active:bg-surface-sunken',
  subtle: 'bg-surface-sunken text-ink hover:bg-line active:bg-line',
  danger: 'text-urgent hover:bg-urgent-subtle active:bg-urgent-subtle',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5 rounded-sm',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Renders a spinner and disables interaction without changing the button's width. */
  loading?: boolean
  iconOnly?: boolean
  iconStart?: ReactNode
  iconEnd?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconOnly = false,
    iconStart,
    iconEnd,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      // Keeps the button square when only an icon is inside.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-soft)]',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        iconOnly && (size === 'sm' ? 'w-7 px-0' : size === 'lg' ? 'w-11 px-0' : 'w-9 px-0'),
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 16 : 14} /> : iconStart}
      {children}
      {!loading && iconEnd}
    </button>
  )
})

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 animate-spin', className)}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

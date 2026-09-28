import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/cn.ts'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /**
   * Required. Icon-only buttons have no visible text, so this is their only
   * accessible name. Making it mandatory is what stops them shipping unlabelled.
   */
  label: string
  size?: keyof typeof SIZES
  children: ReactNode
}

const SIZES = {
  sm: 'size-7',
  md: 'size-9',
  lg: 'size-11',
} as const

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-md text-ink-tertiary',
        'transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-soft)]',
        'hover:bg-surface-sunken hover:text-ink active:scale-95',
        'disabled:pointer-events-none disabled:opacity-40',
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})

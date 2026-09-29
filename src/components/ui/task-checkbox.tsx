import { forwardRef } from 'react'

import { cn } from '../../lib/cn.ts'

export interface TaskCheckboxProps {
  checked: boolean
  onChange: (next: boolean) => void
  /** Accessible name. Describes the action, e.g. "Mark 'Submit report' as complete". */
  label: string
  className?: string
  /**
   * Identifies this control within its row so arrow-key navigation can move
   * focus to the *same* control in the neighbouring row.
   */
  dataRole?: string
}

/**
 * The task completion control.
 *
 * Built on `role="checkbox"` rather than a visually hidden `<input>`: a real
 * button gives reliable focus and keyboard behaviour, and exposes
 * `aria-checked` for screen readers, while still letting the tick animate.
 *
 * The checkmark is drawn with `stroke-dashoffset` so the stroke appears to trace
 * itself. It is the one place in the app with a decorative flourish, and it
 * earns its place by confirming the exact action the user just took.
 */
export const TaskCheckbox = forwardRef<HTMLButtonElement, TaskCheckboxProps>(
  function TaskCheckbox({ checked, onChange, label, className, dataRole }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        data-role={dataRole}
        aria-checked={checked}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          onChange(!checked)
        }}
        className={cn(
          'group relative grid size-[18px] shrink-0 place-items-center rounded-[5px] border',
          'transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out-soft)]',
          'hover:border-accent active:scale-90',
          checked
            ? 'border-accent bg-accent hover:bg-accent-hover'
            : 'border-line-strong bg-surface hover:border-accent',
          className,
        )}
      >
        <svg
          viewBox="0 0 12 12"
          className={cn(
            'size-3 transition-opacity duration-150',
            checked ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden="true"
        >
          <path
            d="M2.5 6.2 4.8 8.5 9.5 3.8"
            fill="none"
            stroke="var(--color-on-accent)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="12"
            strokeDashoffset={checked ? 0 : 12}
            style={{ transition: 'stroke-dashoffset 220ms var(--ease-out-expo)' }}
          />
        </svg>
      </button>
    )
  },
)

import { useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button.tsx'
import { IconButton } from '../../components/ui/icon-button.tsx'
import { Select } from '../../components/ui/field.tsx'
import { PRIORITIES, type Priority } from '../../../shared/task.ts'
import { isValidDateKey, todayKey } from '../../../shared/dates.ts'
import { PRIORITY_META } from '../../components/ui/badge.tsx'
import { cn } from '../../lib/cn.ts'
import { useWorkspace } from '../workspace/workspace-context.tsx'

/**
 * The manual task composer.
 *
 * Stays a plain form: the AI path lives in the command bar, and keeping manual
 * entry to title + priority + date means the common case is one keystroke to
 * submit. Anything richer belongs in the editor dialog.
 */
export function QuickAdd({ className }: { className?: string }) {
  const { addTask, openOverlay, tasks } = useQuickAddData()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setTitle('')
    setPriority('medium')
    setDueDate('')
    setShowOptions(false)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (trimmed.length === 0) return

    addTask({
      title: trimmed,
      priority,
      dueDate: dueDate === '' ? null : isValidDateKey(dueDate) ? dueDate : null,
      source: 'manual',
    })
    reset()
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={onSubmit} className={cn('px-3 pt-3 sm:px-5', className)}>
      <div
        className={cn(
          'rounded-xl border border-line bg-surface shadow-[0_1px_0_rgba(31,26,23,0.02)] transition-colors duration-150',
          'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10',
        )}
      >
        {/* Keep the title row single-line on mobile so Add never drops off screen. */}
        <div className="flex items-center gap-2 px-3 py-1.5 sm:gap-2.5">
          <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-disabled" fill="none" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <label htmlFor="quick-add" className="sr-only">
            Task title
          </label>
          <input
            ref={inputRef}
            id="quick-add"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a task…"
            maxLength={200}
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-tertiary focus:outline-none sm:h-10 sm:text-sm"
          />
          <Button type="submit" size="sm" variant={title.trim() ? 'primary' : 'ghost'} disabled={!title.trim()} className="h-9 shrink-0 sm:h-7">
            Add
          </Button>
        </div>

        {showOptions && (
          <div className="flex animate-[var(--animate-slide-up)] flex-col gap-3 border-t border-line px-3 py-3 sm:flex-row sm:items-end sm:gap-2.5">
            <div className="flex min-w-[124px] flex-col gap-1.5">
              <label htmlFor="quick-add-priority" className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-secondary">
                Priority
              </label>
              <Select
                id="quick-add-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
                className="h-10 w-full text-[16px] sm:h-8 sm:text-[13px] lg:w-32"
              >
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_META[value].label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex min-w-[124px] flex-col gap-1.5 sm:min-w-[170px]">
              <label htmlFor="quick-add-due" className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-secondary">
                Due date
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="quick-add-due"
                  type="date"
                  value={dueDate}
                  min="2000-01-01"
                  onChange={(event) => setDueDate(event.target.value)}
                  className="h-10 w-full rounded-md border border-line bg-surface px-2 text-[16px] focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none sm:h-8 sm:text-[13px]"
                />
                {!dueDate && (
                  <Button size="sm" variant="ghost" onClick={() => setDueDate(todayKey())}>
                    Today
                  </Button>
                )}
              </div>
            </div>

            <IconButton
              label="Hide options"
              size="sm"
              className="ml-auto self-end"
              onClick={() => setShowOptions(false)}
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
                <path d="M4 6.5 8 10.5l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1.5 sm:mt-1.5 sm:flex-row sm:items-center">
        {!showOptions && (
          <button
            type="button"
            onClick={() => setShowOptions(true)}
            className="rounded px-1.5 py-1 text-left text-xs text-ink-tertiary transition-colors hover:bg-surface-sunken hover:text-ink-secondary"
          >
            Add priority or due date
          </button>
        )}
        <button
          type="button"
          onClick={() => openOverlay({ kind: 'command', action: 'create' })}
          className="rounded px-1.5 py-1 text-left text-xs text-ink-tertiary transition-colors hover:bg-surface-sunken hover:text-ink-secondary sm:ml-auto"
        >
          Describe it in your own words instead
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {tasks.notice?.message ?? ''}
      </p>
    </form>
  )
}

function useQuickAddData() {
  const workspace = useWorkspace()
  return {
    addTask: workspace.tasks.addTask,
    openOverlay: workspace.openOverlay,
    tasks: workspace.tasks,
  }
}

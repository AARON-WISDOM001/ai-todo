import { memo } from 'react'

import { AiBadge, DueDateBadge, PriorityBadge } from '../../components/ui/badge.tsx'
import { IconButton } from '../../components/ui/icon-button.tsx'
import { TaskCheckbox } from '../../components/ui/task-checkbox.tsx'
import { cn } from '../../lib/cn.ts'
import { subtaskProgress } from './task-reducer.ts'
import type { Task } from '../../../shared/task.ts'

export interface TaskRowProps {
  task: Task
  selected: boolean
  onToggle: () => void
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  /** Registers the row so arrow-key navigation can move focus between rows. */
  registerRef?: (element: HTMLDivElement | null) => void
}

function TaskRowImpl({
  task,
  selected,
  onToggle,
  onSelect,
  onEdit,
  onDelete,
  registerRef,
}: TaskRowProps) {
  const progress = subtaskProgress(task)
  const done = task.completed

  return (
    <div
      ref={registerRef}
      data-task-row=""
      data-task-id={task.id}
      // A subtle tint rather than a border: the selected row should read as
      // "active" without adding a line of chrome to the list.
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-2 py-2.5',
        'transition-colors duration-150 ease-[var(--ease-out-soft)] sm:gap-3 sm:px-2.5',
        selected ? 'bg-accent-subtle/60' : 'hover:bg-surface-sunken/70',
        done && 'opacity-60 hover:opacity-100',
      )}
    >
      <div className="self-center">
        <TaskCheckbox
          checked={done}
          onChange={onToggle}
          dataRole="checkbox"
          label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        />
      </div>

      <div className="min-w-0 flex-1 self-center">
        <button
          type="button"
          data-role="title"
          onClick={onSelect}
          className="block w-full min-w-0 text-left outline-offset-4"
          aria-label={`Open details for "${task.title}"`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'text-title min-w-0 flex-1 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden wrap-break-words sm:[display:block] sm:truncate',
                done && 'text-ink-secondary line-through decoration-ink-disabled',
              )}
            >
              {task.title}
            </span>
            {task.source === 'ai' && <AiBadge className="mt-px" />}
          </span>

          {task.description && (
            <span
              className={cn(
                'mt-0.5 block truncate text-[13px] text-ink-secondary',
                done && 'text-ink-tertiary',
              )}
            >
              {task.description}
            </span>
          )}
        </button>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <PriorityBadge priority={task.priority} />
          <DueDateBadge dueDate={task.dueDate} completed={done} />

          {progress && (
            <span className="flex items-center gap-1.5 text-xs text-ink-tertiary">
              <span
                className="h-1 w-10 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-label={`${progress.done} of ${progress.total} subtasks complete`}
              >
                <span
                  className={cn(
                    'block h-full rounded-full transition-[width] duration-300',
                    progress.ratio === 1 ? 'bg-success' : 'bg-accent',
                  )}
                  style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                />
              </span>
              <span className="tabular">
                {progress.done}/{progress.total}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Always in the DOM so keyboard users can reach it; revealed on hover or focus. */}
      <div
        className={cn(
          'flex shrink-0 items-center self-center pr-0.5',
          'opacity-0 transition-opacity duration-150',
          'group-hover:opacity-100 group-focus-within:opacity-100',
          // Touch devices have no hover, so the actions stay visible there.
          '[@media(hover:none)]:opacity-100',
        )}
      >
        <IconButton label={`Edit "${task.title}"`} size="sm" data-role="edit" onClick={onEdit} className="size-8">
          <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
            <path d="M11.1 2.6l2.3 2.3-7.6 7.6-3 .7.7-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </IconButton>
        <IconButton
          label={`Delete "${task.title}"`}
          size="sm"
          data-role="delete"
          onClick={onDelete}
          className="size-8 hover:bg-urgent-subtle hover:text-urgent"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
            <path d="M3 4.25h10M6.5 4.25V3a.75.75 0 01.75-.75h1.5A.75.75 0 009.5 3v1.25M4.5 4.25l.55 8a1 1 0 001 .9h3.9a1 1 0 001-.9l.55-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
      </div>
    </div>
  )
}

/**
 * Memoised because the list re-renders on every filter change, and an unchanged
 * row should not. Callbacks are stable (the workspace context memoises them), so
 * the shallow compare is sufficient.
 */
export const TaskRow = memo(TaskRowImpl)

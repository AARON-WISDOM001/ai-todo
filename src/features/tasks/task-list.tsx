import { useCallback, useMemo, useRef } from 'react'

import { Button } from '../../components/ui/button.tsx'
import { EmptyState } from '../../components/ui/feedback.tsx'
import { cn } from '../../lib/cn.ts'
import { applyFilters, type TaskView } from './task-selectors.ts'
import { TaskRow } from './task-row.tsx'
import { useWorkspace } from '../workspace/workspace-context.tsx'
import type { Priority } from '../../../shared/task.ts'
import { PRIORITY_META } from '../../components/ui/badge.tsx'

/**
 * The task list.
 *
 * Keyboard model: every row is individually tabbable (checkbox, title, actions),
 * and ArrowUp/ArrowDown from any control inside a row moves focus to the same
 * control in the neighbouring row. That gives fast keyboard completion without
 * an ARIA pattern that would forbid the buttons the rows need.
 */
export function TaskList({ className }: { className?: string }) {
  const { tasks, filters, selectedId, select, openOverlay, clearFilters, hasActiveFilters } = useWorkspace()
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const visible = useMemo(() => applyFilters(tasks.tasks, filters), [tasks.tasks, filters])

  const registerRef = useCallback((id: string) => {
    return (element: HTMLDivElement | null) => {
      if (element) rowRefs.current.set(id, element)
      else rowRefs.current.delete(id)
    }
  }, [])

  /** Moves focus to the same descendant control in the row `offset` places away. */
  const moveFocus = useCallback((fromId: string, offset: number) => {
    const ids = visible.map((task) => task.id)
    const index = ids.indexOf(fromId)
    const nextIndex = index + offset
    if (index === -1 || nextIndex < 0 || nextIndex >= ids.length) return

    const nextId = ids[nextIndex]!
    const row = rowRefs.current.get(nextId)
    if (!row) return

    const active = document.activeElement
    const selector =
      active instanceof HTMLElement && active.dataset.role ? `[data-role="${active.dataset.role}"]` : '[role="checkbox"]'
    const target = row.querySelector<HTMLElement>(selector) ?? row
    target.focus()
  }, [visible])

  const handleRowKeyDown = (event: React.KeyboardEvent, taskId: string) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(taskId, 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(taskId, -1)
    }
  }

  if (visible.length === 0) {
    return (
      <div className={cn('flex flex-1 items-center justify-center px-5', className)}>
        {hasActiveFilters ? (
          <EmptyState
            compact
            icon={<SearchOffIcon />}
            title="No matches"
            description={
              filters.priorities.length > 0
                ? `Nothing matches ${filters.search.trim() || 'this search'} at ${filters.priorities.map((p) => PRIORITY_META[p as Priority].label.toLowerCase()).join(' or ')} priority.`
                : `Nothing matches “${filters.search.trim()}”.`
            }
            action={
              <Button size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <ViewEmptyState
            view={filters.view}
            onOpenAi={() => openOverlay({ kind: 'command', action: 'create' })}
          />
        )}
      </div>
    )
  }

  return (
    <div className={cn('scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-2 pb-8 sm:px-3', className)}>
      <ul className="space-y-0.5" aria-label="Tasks">
        {visible.map((task) => (
          <li key={task.id}>
            <div
              onKeyDown={(event) => handleRowKeyDown(event, task.id)}
              data-task-nav={task.id}
            >
              <TaskRow
                task={task}
                selected={task.id === selectedId}
                registerRef={registerRef(task.id)}
                onToggle={() => tasks.toggleTask(task.id)}
                onSelect={() => {
                  select(task.id)
                  openOverlay({ kind: 'editor', taskId: task.id })
                }}
                onEdit={() => openOverlay({ kind: 'editor', taskId: task.id })}
                onDelete={() => tasks.removeTask(task.id)}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Each view gets its own empty state, because the next action differs. */
function ViewEmptyState({ view, onOpenAi }: { view: TaskView; onOpenAi: () => void }) {
  switch (view) {
    case 'completed':
      return (
        <EmptyState
          icon={<TrophyIcon />}
          title="No completed tasks yet"
          description="Finished tasks collect here so you can see what you have already cleared."
        />
      )
    case 'today':
      return (
        <EmptyState
          icon={<SunIcon />}
          title="Nothing due today"
          description="You are clear. Add something, or describe a plan in your own words and let AI set the dates."
          action={
            <Button size="sm" variant="primary" onClick={onOpenAi}>
              Plan with AI
            </Button>
          }
        />
      )
    case 'upcoming':
      return (
        <EmptyState
          icon={<CalendarIcon />}
          title="No upcoming tasks"
          description="Tasks with a due date in the future will show up here."
        />
      )
    default:
      return (
        <EmptyState
          icon={<SparkIcon />}
          title="Your list is clear"
          description="Add your first task above, or describe what you need to get done in your own words."
          action={
            <Button size="sm" variant="primary" onClick={onOpenAi}>
              Create with AI
            </Button>
          }
        />
      )
  }
}

/* Glyphs sized to the empty-state frame. */

function SearchOffIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12.8 12.8l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
      <path d="M6 3.5h8v4a4 4 0 01-8 0zM6 5H4a2 2 0 002 2.5M14 5h2a2 2 0 01-2 2.5M10 11.5v3M7 17.5h6M8.5 14.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
      <rect x="3.25" y="4.25" width="13.5" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.25 8h13.5M7 2.75v3M13 2.75v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M8.5 2.5l1.4 3.85 3.85 1.4-3.85 1.4-1.4 3.85-1.4-3.85L3.25 7.75l3.85-1.4z" />
      <path d="M15 12.5l.65 1.75 1.75.65-1.75.65-.65 1.75-.65-1.75-1.75-.65 1.75-.65z" opacity="0.5" />
    </svg>
  )
}

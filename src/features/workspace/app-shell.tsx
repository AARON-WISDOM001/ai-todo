import { useEffect, useRef } from 'react'

import { Button } from '../../components/ui/button.tsx'
import { IconButton } from '../../components/ui/icon-button.tsx'
import { cn } from '../../lib/cn.ts'
import { useModalBehaviour } from '../../lib/use-modal.ts'
import { QuickAdd } from '../tasks/quick-add.tsx'
import { TaskList } from '../tasks/task-list.tsx'
import { PRIORITY_META } from '../../components/ui/badge.tsx'
import { Logo, Sidebar } from './sidebar.tsx'
import { ProductivityStrip, WorkspaceHeader } from './workspace-header.tsx'
import { useWorkspace } from './workspace-context.tsx'
import { PRIORITIES, type Priority } from '../../../shared/task.ts'
import { TASK_VIEWS, VIEW_LABELS, type TaskView } from '../tasks/task-selectors.ts'
import { NotesView } from '../notes/notes-view.tsx'

/**
 * Application layout.
 *
 * Three distinct layouts rather than one shrinking layout:
 *   - Desktop (lg+): persistent sidebar, list, optional detail dialog.
 *   - Tablet:        sidebar collapses into a drawer, list keeps full width.
 *   - Mobile (<md):  no sidebar at all — a bottom tab bar plus a slide-in
 *                    drawer. Navigation moves to the thumb zone, which is the
 *                    one thing a shrunk desktop layout always gets wrong.
 */
export function AppShell() {
  const { tasks, section } = useWorkspace()

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas lg:flex-row">
      <a
        href="#task-list"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-overlay"
      >
        Skip to task list
      </a>

      {/* Desktop sidebar */}
      <div className="hidden shrink-0 lg:block">
        <Sidebar />
      </div>

      <MobileNavDrawer />

      {/* Middle column: header + scrollable content. min-h-0 lets the list scroll
          instead of pushing the tab bar off screen on small viewports. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceHeader />

        <main className="flex min-h-0 flex-1 flex-col bg-canvas">
          {section === 'notes' ? (
            <NotesView />
          ) : (
            <>
              <div className="hidden border-b border-line bg-surface/80 sm:block">
                <ProductivityStrip />
              </div>

              <QuickAdd className="shrink-0" />

              <FilterBar className="shrink-0" />

              <div id="task-list" className="flex min-h-0 flex-1 flex-col">
                <TaskList />
              </div>
            </>
          )}
        </main>
      </div>

      <MobileTabBar />

      <ToastHost
        notice={tasks.notice}
        onDismiss={tasks.dismissNotice}
      />
    </div>
  )
}

/**
 * Mobile navigation drawer.
 *
 * Modelled as a real modal dialog rather than a decorative overlay: it blocks
 * the page behind it, so it must trap focus, close on Escape, and hide the rest
 * of the app from assistive technology. Without that, a keyboard or screen
 * reader user can tab straight out of the drawer into the obscured list behind
 * it and lose track of where they are.
 */
function MobileNavDrawer() {
  const { isMobileNavOpen, setMobileNavOpen } = useWorkspace()
  const panelRef = useRef<HTMLDivElement>(null)

  useModalBehaviour({
    open: isMobileNavOpen,
    onClose: () => setMobileNavOpen(false),
    panelRef,
  })

  if (!isMobileNavOpen) return null

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 animate-fade-in bg-ink/25"
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 animate-slide-in-right outline-none"
      >
        <Sidebar className="shadow-overlay" onNavigate={() => setMobileNavOpen(false)} />
      </div>
    </div>
  )
}

/**
 * Priority filter chips.
 *
 * Deltas with an empty filter chip rather than opening a popover: with only
 * three values, showing them beats hiding them, and it makes the filter state
 * visible at a glance instead of behind a control.
 */
function FilterBar({ className }: { className?: string }) {
  const { filters, togglePriorityFilter, hasActiveFilters, clearFilters, tasks } = useWorkspace()

  const counts = PRIORITIES.reduce<Record<Priority, number>>(
    (acc, priority) => {
      acc[priority] = tasks.tasks.filter(
        (task) => task.priority === priority && task.completed === (filters.view === 'completed'),
      ).length
      return acc
    },
    { high: 0, medium: 0, low: 0 },
  )

  return (
    <div className={cn('scrollbar-subtle flex items-center gap-1.5 overflow-x-auto px-3 py-2 sm:flex-wrap sm:px-5', className)}>
      {PRIORITIES.map((priority) => {
        const active = filters.priorities.includes(priority)
        const meta = PRIORITY_META[priority]
        return (
          <button
            key={priority}
            type="button"
            aria-pressed={active}
            onClick={() => togglePriorityFilter(priority)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap',
              'transition-colors duration-150',
              active
                ? 'border-ink bg-ink text-canvas'
                : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink',
            )}
          >
            <span className={cn('size-1.5 rounded-full', active ? 'bg-canvas/80' : meta.dot)} aria-hidden="true" />
            {meta.label}
            <span className={cn('tabular', active ? 'text-canvas/70' : 'text-ink-tertiary')}>{counts[priority]}</span>
          </button>
        )
      })}

      {hasActiveFilters && (
        <Button size="sm" variant="ghost" onClick={clearFilters} className="ml-1 shrink-0">
          Clear
        </Button>
      )}
    </div>
  )
}

/** Bottom navigation for small screens. Thumb-zone tabs mirror the sidebar views. */
function MobileTabBar() {
  const { filters, setView, setSection, section, openOverlay } = useWorkspace()

  return (
    <nav
      aria-label="Task views"
      data-mobile-tabbar
      className="grid shrink-0 grid-cols-6 border-t border-line bg-surface pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {TASK_VIEWS.map((view) => {
        const active = filters.view === view
        return (
          <button
            key={view}
            type="button"
            onClick={() => {
              setSection('tasks')
              setView(view)
            }}
            aria-current={active && section === 'tasks' ? 'page' : undefined}
            className={cn(
              'flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] leading-tight font-medium transition-colors',
              active && section === 'tasks' ? 'text-accent' : 'text-ink-tertiary',
            )}
          >
            <MobileViewIcon view={view} />
            <span className="max-w-full truncate">{VIEW_LABELS[view]}</span>
          </button>
        )
      })}

      <button
        type="button"
        onClick={() => setSection('notes')}
        aria-current={section === 'notes' ? 'page' : undefined}
        className={cn(
          'flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] leading-tight font-medium transition-colors',
          section === 'notes' ? 'text-accent' : 'text-ink-tertiary',
        )}
      >
        <NotesIcon />
        <span className="max-w-full truncate">Notes</span>
      </button>

      <button
        type="button"
        onClick={() => openOverlay({ kind: 'command', action: 'create' })}
        className="flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] leading-tight font-medium text-accent"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-accent text-on-accent">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
            <path d="M6.5 2l1.05 2.85L10.4 5.9 7.55 6.95 6.5 9.8 5.45 6.95 2.6 5.9 5.45 4.85z" />
          </svg>
        </span>
        Ask AI
      </button>
    </nav>
  )
}

function NotesIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4.5" fill="none" aria-hidden="true">
      <path d="M3 1.75h6.5l3.5 3.5v9H3zM9.5 1.75v3.5H13M5.5 8h5M5.5 10.75h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MobileViewIcon({ view }: { view: TaskView }) {
  const paths: Record<TaskView, string> = {
    all: 'M2.75 4.25h10.5M2.75 8h10.5M2.75 11.75h6.5',
    today:
      'M2.5 4.5h11v9h-11zM2.5 7.5h11M5.5 2.75v2M10.5 2.75v2',
    upcoming: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h7',
    completed: 'M8 2.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM5.6 8.2l1.7 1.7 3.1-3.4',
  }
  return (
    <svg viewBox="0 0 16 16" className="size-[18px]" fill="none" aria-hidden="true">
      <path d={paths[view]} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Transient notices, anchored bottom-right on desktop and above the tab bar on mobile. */
function ToastHost({
  notice,
  onDismiss,
}: {
  notice: { id: string; tone: 'error' | 'success' | 'info'; message: string } | null
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!notice || notice.tone === 'error') return
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [notice, onDismiss])
  if (!notice) return null

  return (
    <div
      role="status"
      aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'fixed right-4 bottom-4 z-50 flex max-w-sm animate-slide-up items-start gap-2.5',
        'rounded-lg border border-line bg-surface px-3.5 py-3 shadow-overlay',
        'mb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:mb-0',
        notice.tone === 'error' && 'border-urgent/30',
      )}
    >
      <span
        className={cn('mt-1 size-1.5 shrink-0 rounded-full', notice.tone === 'error' ? 'bg-urgent' : 'bg-accent')}
        aria-hidden="true"
      />
      <p className="text-[13px] leading-relaxed text-ink">{notice.message}</p>
      <IconButton label="Dismiss" size="sm" className="-mt-0.5 -mr-1" onClick={onDismiss}>
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </IconButton>
    </div>
  )
}

export { Logo }

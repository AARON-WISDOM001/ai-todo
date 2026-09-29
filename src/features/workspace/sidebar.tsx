import type { ReactNode } from 'react'

import { cn } from '../../lib/cn.ts'
import { Kbd } from '../../components/ui/badge.tsx'
import { useWorkspace } from './workspace-context.tsx'
import { useTheme } from '../../lib/theme.tsx'
import { TASK_VIEWS, VIEW_LABELS, type TaskView } from '../tasks/task-selectors.ts'

const NAV_ICONS: Record<TaskView, ReactNode> = {
  all: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.25 6.5h5.5M5.25 9.5h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  today: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.25 6.5h11.5M5.5 1.75v2.5M10.5 1.75v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  upcoming: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  completed: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.4 8.2l1.8 1.8 3.4-3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

/** Product mark: a task square with a tick, and the AI spark at its corner. */
export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="var(--color-ink)" />
      <path
        d="M7 12.4l3.1 3.1L17 8.6"
        stroke="var(--color-on-accent)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19.4 2.1l.72 1.98 1.98.72-1.98.72-.72 1.98-.72-1.98-1.98-.72 1.98-.72z" fill="var(--color-accent-muted)" />
    </svg>
  )
}

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string
  /** Called after any navigation, so the mobile drawer can close itself. */
  onNavigate?: () => void
}) {
  const { filters, setView, viewCountsForSidebar, openOverlay, tasks, isMobileNavOpen, setMobileNavOpen, section, setSection } =
    useSidebarData()
  const { preference, setPreference } = useTheme()

  return (
    <nav
      aria-label="Task views"
      className={cn(
        'flex h-full w-[84vw] max-w-[320px] flex-col border-r border-line bg-surface lg:w-60 lg:max-w-none',
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <Logo />
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">AI Todo</span>
      </div>

      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => openOverlay({ kind: 'command', action: 'create' })}
          className={cn(
            'group flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5',
            'text-[13px] font-medium text-ink transition-colors duration-150',
            'hover:border-line-strong hover:bg-surface-sunken',
          )}
        >
          <svg viewBox="0 0 16 16" className="size-3.5 text-ink-tertiary" fill="none" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Add with AI
          <Kbd className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">⌘K</Kbd>
        </button>
      </div>

      <ul className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
        {TASK_VIEWS.map((view) => {
          const active = filters.view === view
          const count = viewCountsForSidebar[view]
          return (
            <li key={view}>
              <button
                type="button"
                onClick={() => {
                  setView(view)
                  setSection('tasks')
                  setMobileNavOpen(false)
                  onNavigate?.()
                }}
                aria-current={active && section === 'tasks' ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px]',
                  'transition-colors duration-150',
                  active
                    ? 'bg-surface-sunken font-medium text-ink'
                    : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                )}
              >
                <span className={active ? 'text-ink' : 'text-ink-tertiary'}>{NAV_ICONS[view]}</span>
                {VIEW_LABELS[view]}
                {count > 0 && (
                  <span
                    className={cn(
                      'tabular ml-auto text-xs',
                      active ? 'text-ink-secondary' : 'text-ink-tertiary',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={() => {
              setSection('notes')
              setMobileNavOpen(false)
              onNavigate?.()
            }}
            aria-current={section === 'notes' ? 'page' : undefined}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-150',
              section === 'notes'
                ? 'bg-surface-sunken font-medium text-ink'
                : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
            )}
          >
            <NotesNavIcon />
            Notes
          </button>
        </li>
      </ul>

      <div className="shrink-0 space-y-0.5 border-t border-line px-3 py-3">
        <button
          type="button"
          onClick={() => openOverlay({ kind: 'command', action: 'prioritize' })}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px]',
            'text-ink-secondary transition-colors duration-150 hover:bg-surface-sunken hover:text-ink',
          )}
        >
          <SparkleIcon />
          Ask AI what to do next
        </button>

        {viewCountsForSidebar.completed > 0 && (
          <button
            type="button"
            onClick={() => tasks.clearCompleted()}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px]',
              'text-ink-tertiary transition-colors duration-150 hover:bg-surface-sunken hover:text-ink',
            )}
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path d="M3 5.5h10M6 5.5V4a1 1 0 011-1h2a1 1 0 011 1v1.5M5 5.5l.6 7a1 1 0 001 .9h2.8a1 1 0 001-.9l.6-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Clear completed
          </button>
        )}

        <label className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-[13px] text-ink-secondary">
          <span>Appearance</span>
          <select
            aria-label="Color theme"
            value={preference}
            onChange={(event) => setPreference(event.target.value as 'system' | 'light' | 'dark')}
            className="h-8 rounded border border-line bg-surface px-2 text-xs text-ink focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <p className="sr-only" aria-live="polite">
        {isMobileNavOpen ? 'Navigation open' : 'Navigation closed'}
      </p>
    </nav>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 text-accent" fill="currentColor" aria-hidden="true">
      <path d="M8 2l1.15 3.1L12.25 6.25 9.15 7.4 8 10.5 6.85 7.4 3.75 6.25 6.85 5.1z" />
      <path d="M12.75 10.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" opacity="0.55" />
    </svg>
  )
}

/** Narrow adapter so the sidebar only pulls the fields it renders. */
function useSidebarData() {
  const workspace = useWorkspace()
  return {
    filters: workspace.filters,
    section: workspace.section,
    setSection: workspace.setSection,
    setView: workspace.setView,
    viewCountsForSidebar: workspace.tasks.viewCounts,
    openOverlay: workspace.openOverlay,
    tasks: workspace.tasks,
    isMobileNavOpen: workspace.isMobileNavOpen,
    setMobileNavOpen: workspace.setMobileNavOpen,
  }
}

function NotesNavIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <path d="M3 1.75h6.5l3.5 3.5v9H3zM9.5 1.75v3.5H13M5.5 8h5M5.5 10.75h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

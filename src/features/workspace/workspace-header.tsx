import { useEffect, useRef } from 'react'

import { Button, Spinner } from '../../components/ui/button.tsx'
import { IconButton } from '../../components/ui/icon-button.tsx'
import { Kbd } from '../../components/ui/badge.tsx'
import { cn } from '../../lib/cn.ts'
import { SORT_LABELS, VIEW_LABELS, type SortOrder } from '../tasks/task-selectors.ts'
import { useWorkspace } from './workspace-context.tsx'

const SORT_OPTIONS = Object.entries(SORT_LABELS) as [SortOrder, string][]

export function WorkspaceHeader({ className }: { className?: string }) {
  const { filters, setSearch, setSort, tasks, openOverlay, setMobileNavOpen, selectedId } =
    useWorkspace()
  const searchRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl-K focuses search from anywhere; ⌘\ is the AI command palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return

      if (event.key === 'k' && !event.shiftKey) {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const count = tasks.viewCounts[filters.view]
  const isSearching = filters.search.trim().length > 0

  return (
    <header className={cn('shrink-0 border-b border-line bg-surface/85 backdrop-blur-[2px]', className)}>
      {/* Title row + search row stack on mobile, single row on desktop. */}
      <div className="flex flex-col gap-2 px-3 py-2 sm:h-14 sm:flex-row sm:items-center sm:gap-2 sm:px-5 sm:py-0">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <IconButton label="Open navigation" onClick={() => setMobileNavOpen(true)} className="shrink-0 lg:hidden">
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </IconButton>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em]">
              {VIEW_LABELS[filters.view]}
            </h1>
            <p className="tabular text-xs text-ink-tertiary">
              {count === 0
                ? 'Nothing here yet'
                : `${count} ${count === 1 ? 'task' : 'tasks'}${
                    filters.view === 'completed' ? ' completed' : ' open'
                  }`}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:flex-none">
          {/* Search keeps its width on desktop and drops to its own row on mobile. */}
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              value={filters.search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks"
              aria-label="Search tasks by title, description, or subtask"
              className={cn(
                'h-10 w-full rounded-md border border-line bg-surface-sunken pr-9 pl-8 text-[16px]',
                'placeholder:text-ink-tertiary transition-[width,background-color,border-color] duration-200',
                'ease-[var(--ease-out-soft)] hover:bg-surface-sunken',
                'focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/20 focus:outline-none',
                'sm:h-9 sm:w-44 sm:text-[13px] sm:focus:w-64',
              )}
            />
            {!isSearching && (
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">
                <Kbd>⌘K</Kbd>
              </span>
            )}
          </div>

          <div className="mx-0.5 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />

          <label className="hidden items-center md:flex">
            <span className="sr-only">Sort tasks</span>
            <select
              value={filters.sort}
              onChange={(event) => setSort(event.target.value as SortOrder)}
              className={cn(
                'h-9 cursor-pointer appearance-none rounded-md border border-line bg-surface',
                'pr-7 pl-2.5 text-[13px] text-ink-secondary transition-colors hover:border-line-strong',
                'focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none',
              )}
            >
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>

          <Button
            variant="primary"
            onClick={() =>
              openOverlay(
                selectedId
                  ? { kind: 'command', action: 'improve', taskId: selectedId }
                  : { kind: 'command', action: 'create' },
              )
            }
            className="shrink-0"
          >
            <SparkleIcon />
            <span className="hidden sm:inline">
              {selectedId ? 'Improve with AI' : 'Ask AI'}
            </span>
            <Kbd className="hidden bg-on-accent/15 text-on-accent/80 lg:inline-flex">⌘J</Kbd>
          </Button>
        </div>
      </div>

      <div className="border-t border-line px-3 py-2 sm:hidden">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="left-2.5" />
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks"
              aria-label="Search tasks by title, description, or subtask"
              className="h-9 w-full rounded-md border border-line bg-surface-sunken pr-3 pl-8 text-[13px] focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/20 focus:outline-none"
            />
          </div>

          <label className="relative shrink-0">
            <span className="sr-only">Sort tasks</span>
            <select
              value={filters.sort}
              onChange={(event) => setSort(event.target.value as SortOrder)}
              className="h-9 cursor-pointer appearance-none rounded-md border border-line bg-surface pr-7 pl-2.5 text-[13px] text-ink-secondary transition-colors hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
            >
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>
        </div>
      </div>
    </header>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn('absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-tertiary', className)}
    >
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.2 10.2L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="pointer-events-none -ml-5.5 size-3 text-ink-tertiary"
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
      <path d="M6.5 2l1.05 2.85L10.4 5.9 7.55 6.95 6.5 9.8 5.45 6.95 2.6 5.9 5.45 4.85z" />
      <path d="M11.75 9.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" opacity="0.7" />
    </svg>
  )
}

/** Inline progress read for the header. Six numbers, no charts. */
export function ProductivityStrip({ className }: { className?: string }) {
  const { tasks, filters } = useWorkspace()
  const { stats } = tasks
  const remaining = stats.remaining
  const today = stats.dueToday

  return (
    <div className={cn('flex items-center gap-4 px-5 py-2.5', className)}>
      <Stat value={remaining} label="remaining" />
      <Divider />
      <Stat value={today} label="due today" emphasis={today > 0} />
      <Divider />
      <Stat value={stats.overdue} label="overdue" emphasis={stats.overdue > 0} tone="urgent" />
      <Divider />
      <Stat value={stats.completed} label="done" />

      <div className="ml-auto flex items-center gap-2.5">
        <div
          className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={Math.round(stats.completionRate * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall completion"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-out-soft)]"
            style={{ width: `${Math.round(stats.completionRate * 100)}%` }}
          />
        </div>
        <span className="tabular text-xs text-ink-tertiary">
          {Math.round(stats.completionRate * 100)}%
        </span>
      </div>

      <p className="sr-only" aria-live="polite">
        {filters.view} view: {remaining} remaining, {today} due today, {stats.completed} completed.
      </p>
    </div>
  )
}

function Stat({
  value,
  label,
  emphasis,
  tone = 'default',
}: {
  value: number
  label: string
  emphasis?: boolean
  tone?: 'default' | 'urgent'
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          'tabular text-[13px] font-semibold',
          // `ink-disabled` is sub-AA and reserved for decoration, so a zero
          // count is rendered in the tertiary token instead.
          value === 0 && 'text-ink-tertiary',
          value > 0 && tone === 'urgent' && 'text-urgent',
          value > 0 && tone === 'default' && (emphasis ? 'text-ink' : 'text-ink-secondary'),
        )}
      >
        {value}
      </span>
      <span className="text-xs text-ink-tertiary">{label}</span>
    </span>
  )
}

function Divider() {
  return <span className="h-3 w-px bg-line" aria-hidden="true" />
}

export { Spinner }

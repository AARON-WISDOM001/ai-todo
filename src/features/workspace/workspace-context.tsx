/**
 * Workspace state: tasks, filters, selection, and which overlay is open.
 *
 * One provider owns all of it so the AI surfaces, the task list, and the detail
 * panel read from a single source rather than threading props through five
 * levels. The context value is memoised to keep re-renders scoped to consumers.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { CreateTaskInput, Task, UpdateTaskInput } from '../../../shared/task.ts'
import { useTasks } from '../tasks/use-tasks.ts'
import { DEFAULT_FILTERS, type SortOrder, type TaskFilters, type TaskView } from '../tasks/task-selectors.ts'
import type { AiAction } from '../../../shared/ai.ts'

export type Overlay =
  | { kind: 'none' }
  | { kind: 'command'; action: AiAction; taskId?: string }
  | { kind: 'editor'; taskId: string | null }

interface WorkspaceValue {
  tasks: ReturnType<typeof useTasks>
  filters: TaskFilters
  setView: (view: TaskView) => void
  setSearch: (search: string) => void
  setSort: (sort: SortOrder) => void
  togglePriorityFilter: (priority: TaskFilters['priorities'][number]) => void
  clearFilters: () => void
  hasActiveFilters: boolean
  /** Task shown in the detail panel, or null when the panel is closed. */
  selectedId: string | null
  select: (id: string | null) => void
  selectedTask: Task | undefined
  overlay: Overlay
  openOverlay: (overlay: Exclude<Overlay, { kind: 'none' }>) => void
  closeOverlay: () => void
  /** True on viewports below the sidebar breakpoint. */
  isMobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const tasks = useTasks()

  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [isMobileNavOpen, setMobileNavOpen] = useState(false)

  const setView = useCallback((view: TaskView) => {
    setFilters((current) => ({ ...current, view }))
  }, [])

  const setSearch = useCallback((search: string) => {
    setFilters((current) => ({ ...current, search }))
  }, [])

  const setSort = useCallback((sort: SortOrder) => {
    setFilters((current) => ({ ...current, sort }))
  }, [])

  const togglePriorityFilter = useCallback((priority: TaskFilters['priorities'][number]) => {
    setFilters((current) => ({
      ...current,
      priorities: current.priorities.includes(priority)
        ? current.priorities.filter((entry) => entry !== priority)
        : [...current.priorities, priority],
    }))
  }, [])

  const clearFilters = useCallback(() => {
    // The view is navigation, not a filter, so switching views should survive.
    setFilters((current) => ({ ...current, search: '', priorities: [] }))
  }, [])

  const hasActiveFilters = filters.search.trim().length > 0 || filters.priorities.length > 0

  // Selecting a task is meaningless once it no longer matches the view.
  const select = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  const openOverlay = useCallback((next: Exclude<Overlay, { kind: 'none' }>) => {
    setOverlay(next)
  }, [])

  const closeOverlay = useCallback(() => setOverlay({ kind: 'none' }), [])

  const selectedTask = useMemo(
    () => tasks.tasks.find((task) => task.id === selectedId),
    [tasks.tasks, selectedId],
  )

  // Keep a stale selection from lingering after the task is deleted.
  const resolvedSelectedId = selectedTask ? selectedId : null

  const value = useMemo<WorkspaceValue>(
    () => ({
      tasks,
      filters,
      setView,
      setSearch,
      setSort,
      togglePriorityFilter,
      clearFilters,
      hasActiveFilters,
      selectedId: resolvedSelectedId,
      select,
      selectedTask,
      overlay,
      openOverlay,
      closeOverlay,
      isMobileNavOpen,
      setMobileNavOpen,
    }),
    [
      tasks,
      filters,
      setView,
      setSearch,
      setSort,
      togglePriorityFilter,
      clearFilters,
      hasActiveFilters,
      resolvedSelectedId,
      select,
      selectedTask,
      overlay,
      openOverlay,
      closeOverlay,
      isMobileNavOpen,
    ],
  )

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside a WorkspaceProvider')
  return value
}

export type { CreateTaskInput, UpdateTaskInput }

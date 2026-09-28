/**
 * Derived views over the task list: filtering, search, ordering, and the
 * lightweight stats shown in the header.
 *
 * All pure and all cheap enough to run on every render — the lists here are
 * bounded by what one person can realistically type, so memoising further would
 * add indirection without buying anything.
 */

import { compareDateKeys, isOverdue, todayKey } from '../../../shared/dates.ts'
import { PRIORITIES, type Priority, type Task } from '../../../shared/task.ts'

/** The scopes shown in the sidebar. */
export const TASK_VIEWS = ['all', 'today', 'upcoming', 'completed'] as const
export type TaskView = (typeof TASK_VIEWS)[number]

export const VIEW_LABELS: Record<TaskView, string> = {
  all: 'All tasks',
  today: 'Today',
  upcoming: 'Upcoming',
  completed: 'Completed',
}

/** How the list is ordered. `manual` preserves creation order. */
export type SortOrder = 'manual' | 'dueDate' | 'priority' | 'created'

export const SORT_LABELS: Record<SortOrder, string> = {
  manual: 'Manual',
  dueDate: 'Due date',
  priority: 'Priority',
  created: 'Newest',
}

export interface TaskFilters {
  view: TaskView
  search: string
  priorities: Priority[]
  sort: SortOrder
  /** When true, hides tasks with subtasks still open. */
  hideOverdue: boolean
}

export const DEFAULT_FILTERS: TaskFilters = {
  view: 'all',
  search: '',
  priorities: [],
  sort: 'manual',
  hideOverdue: false,
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

/**
 * Ranks a task's due date for the "Today" view.
 *
 * A task belongs in Today when it is due today, already overdue, or the user
 * has started it without a date — those are the things actually actionable now.
 */
function isDueToday(task: Task, today: string): boolean {
  if (task.dueDate) return compareDateKeys(task.dueDate, today) <= 0
  return false
}

/** True when the task falls inside the requested sidebar scope. */
export function matchesView(task: Task, view: TaskView, today: string): boolean {
  switch (view) {
    case 'all':
      return !task.completed
    case 'today':
      return !task.completed && isDueToday(task, today)
    case 'upcoming':
      return !task.completed && task.dueDate !== null && compareDateKeys(task.dueDate, today) > 0
    case 'completed':
      return task.completed
    default:
      return true
  }
}

/**
 * Case-insensitive search across the fields a user would actually recall.
 *
 * Every whitespace-separated term must match somewhere, so "report intern"
 * narrows rather than widens. This is a deliberate difference from naive
 * substring matching and behaves the way search boxes are expected to.
 */
export function matchesSearch(task: Task, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const haystack = [task.title, task.description, ...task.subtasks.map((s) => s.title), task.dueDate ?? '']
    .join(' ')
    .toLowerCase()

  return terms.every((term) => haystack.includes(term))
}

export function applyFilters(tasks: Task[], filters: TaskFilters, now: Date = new Date()): Task[] {
  const today = todayKey(now)

  const filtered = tasks.filter((task) => {
    if (!matchesView(task, filters.view, today)) return false
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false
    if (filters.hideOverdue && isOverdue(task.dueDate, task.completed, now)) return false
    return matchesSearch(task, filters.search)
  })

  return sortTasks(filtered, filters.sort)
}

export function sortTasks(tasks: Task[], sort: SortOrder): Task[] {
  // Copy first: `tasks` is reducer state and must never be mutated in place.
  const sorted = [...tasks]
  switch (sort) {
    case 'dueDate':
      // Undated tasks sort last rather than first — a date is the stronger signal.
      return sorted.sort((a, b) => {
        if (a.dueDate === null && b.dueDate === null) return 0
        if (a.dueDate === null) return 1
        if (b.dueDate === null) return -1
        return compareDateKeys(a.dueDate, b.dueDate)
      })
    case 'priority':
      return sorted.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title),
      )
    case 'created':
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'manual':
    default:
      return sorted
  }
}

/* -------------------------------------------------------------------------- */
/*  Stats                                                                      */
/* -------------------------------------------------------------------------- */

export interface TaskStats {
  total: number
  completed: number
  remaining: number
  dueToday: number
  overdue: number
  /** Completion across everything, 0–1. */
  completionRate: number
  /** Fraction of remaining work that is high priority, 0–1. */
  highPriorityShare: number
}

/**
 * Computes the header summary.
 *
 * Kept to six numbers on purpose. This is a glanceable progress read, not an
 * analytics surface.
 */
export function computeStats(tasks: Task[], now: Date = new Date()): TaskStats {
  const today = todayKey(now)
  const completed = tasks.filter((task) => task.completed).length
  const open = tasks.filter((task) => !task.completed)
  const highPriority = open.filter((task) => task.priority === 'high').length

  return {
    total: tasks.length,
    completed,
    remaining: open.length,
    dueToday: open.filter((task) => isDueToday(task, today)).length,
    overdue: open.filter((task) => isOverdue(task.dueDate, false, now)).length,
    completionRate: tasks.length === 0 ? 0 : completed / tasks.length,
    highPriorityShare: open.length === 0 ? 0 : highPriority / open.length,
  }
}

/** Sidebar counts, including how many items each scope holds. */
export function computeViewCounts(tasks: Task[], now: Date = new Date()): Record<TaskView, number> {
  const today = todayKey(now)
  return {
    all: tasks.filter((task) => !task.completed).length,
    today: tasks.filter((task) => !task.completed && isDueToday(task, today)).length,
    upcoming: tasks.filter(
      (task) => !task.completed && task.dueDate !== null && compareDateKeys(task.dueDate, today) > 0,
    ).length,
    completed: tasks.filter((task) => task.completed).length,
  }
}

export { PRIORITIES, PRIORITY_RANK }

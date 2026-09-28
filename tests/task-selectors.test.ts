import { describe, expect, it } from 'vitest'

import {
  DEFAULT_FILTERS,
  applyFilters,
  computeStats,
  computeViewCounts,
  matchesSearch,
  matchesView,
  sortTasks,
  type TaskFilters,
} from '../src/features/tasks/task-selectors.ts'
import { NOW, TODAY, makeTask } from './fixtures/tasks.ts'

const day = (offset: number) => {
  const date = new Date(NOW)
  date.setDate(date.getDate() + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const filters = (overrides: Partial<TaskFilters> = {}): TaskFilters => ({
  ...DEFAULT_FILTERS,
  ...overrides,
})

describe('matchesView', () => {
  const overdue = makeTask({ id: 'overdue', dueDate: day(-2) })
  const dueToday = makeTask({ id: 'today', dueDate: TODAY })
  const future = makeTask({ id: 'future', dueDate: day(5) })
  const undated = makeTask({ id: 'undated', dueDate: null })
  const done = makeTask({ id: 'done', dueDate: day(-1), completed: true })

  it('"all" shows open work and hides completed work', () => {
    expect(matchesView(overdue, 'all', TODAY)).toBe(true)
    expect(matchesView(undated, 'all', TODAY)).toBe(true)
    expect(matchesView(done, 'all', TODAY)).toBe(false)
  })

  it('"today" includes overdue work, because that is what is actionable now', () => {
    expect(matchesView(overdue, 'today', TODAY)).toBe(true)
    expect(matchesView(dueToday, 'today', TODAY)).toBe(true)
    expect(matchesView(future, 'today', TODAY)).toBe(false)
    expect(matchesView(undated, 'today', TODAY)).toBe(false)
  })

  it('"upcoming" is strictly the future', () => {
    expect(matchesView(future, 'upcoming', TODAY)).toBe(true)
    expect(matchesView(dueToday, 'upcoming', TODAY)).toBe(false)
    expect(matchesView(undated, 'upcoming', TODAY)).toBe(false)
  })

  it('"completed" is the only view that shows finished work', () => {
    expect(matchesView(done, 'completed', TODAY)).toBe(true)
    expect(matchesView(overdue, 'completed', TODAY)).toBe(false)
  })
})

describe('matchesSearch', () => {
  const task = makeTask({
    title: 'Submit internship report',
    description: 'Needs supervisor review',
    subtasks: [{ id: 's1', title: 'Draft the results section', completed: false }],
    dueDate: TODAY,
  })

  it('matches on title, description, and subtask text', () => {
    expect(matchesSearch(task, 'internship')).toBe(true)
    expect(matchesSearch(task, 'supervisor')).toBe(true)
    expect(matchesSearch(task, 'results section')).toBe(true)
    expect(matchesSearch(task, TODAY)).toBe(true) // due date is searchable
  })

  it('requires every term to match, so extra words narrow the result', () => {
    expect(matchesSearch(task, 'report intern')).toBe(true)
    expect(matchesSearch(task, 'report kubernetes')).toBe(false)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(matchesSearch(task, '  INTERNSHIP  ')).toBe(true)
  })

  it('matches everything when the query is empty', () => {
    expect(matchesSearch(task, '')).toBe(true)
    expect(matchesSearch(task, '   ')).toBe(true)
  })
})

describe('applyFilters', () => {
  const tasks = [
    makeTask({ id: 'a', title: 'Alpha', priority: 'high', dueDate: TODAY }),
    makeTask({ id: 'b', title: 'Beta', priority: 'low', dueDate: day(4) }),
    makeTask({ id: 'c', title: 'Gamma', priority: 'high', dueDate: day(-3) }),
    makeTask({ id: 'd', title: 'Done thing', completed: true, dueDate: day(-1) }),
  ]

  it('returns only open tasks by default', () => {
    expect(applyFilters(tasks, filters(), NOW).map((task) => task.id)).toEqual(['a', 'b', 'c'])
  })

  it('combines a priority filter with a search term', () => {
    const result = applyFilters(tasks, filters({ priorities: ['high'], search: 'gamma' }), NOW)
    expect(result.map((task) => task.id)).toEqual(['c'])
  })

  it('can hide overdue tasks', () => {
    const result = applyFilters(tasks, filters({ hideOverdue: true }), NOW)
    expect(result.map((task) => task.id)).toEqual(['a', 'b'])
  })

  it('can return nothing at all', () => {
    expect(applyFilters(tasks, filters({ search: 'no such task' }), NOW)).toEqual([])
  })
})

describe('sortTasks', () => {
  const tasks = [
    makeTask({ id: 'undated', dueDate: null, priority: 'low', createdAt: '2026-01-03T00:00:00.000Z' }),
    makeTask({ id: 'late', dueDate: day(9), priority: 'low', createdAt: '2026-01-01T00:00:00.000Z' }),
    makeTask({ id: 'soon', dueDate: day(1), priority: 'high', createdAt: '2026-01-02T00:00:00.000Z' }),
  ]

  it('sorts by due date, pushing undated tasks last', () => {
    expect(sortTasks(tasks, 'dueDate').map((task) => task.id)).toEqual(['soon', 'late', 'undated'])
  })

  it('sorts by priority, breaking ties by title', () => {
    const samePriority = [
      makeTask({ id: 'z', title: 'Zebra', priority: 'high' }),
      makeTask({ id: 'a', title: 'Apple', priority: 'high' }),
      makeTask({ id: 'l', title: 'Low', priority: 'low' }),
    ]
    expect(sortTasks(samePriority, 'priority').map((task) => task.id)).toEqual(['a', 'z', 'l'])
  })

  it('sorts newest first by creation time', () => {
    expect(sortTasks(tasks, 'created').map((task) => task.id)).toEqual(['undated', 'soon', 'late'])
  })

  it('preserves input order for "manual"', () => {
    expect(sortTasks(tasks, 'manual').map((task) => task.id)).toEqual(['undated', 'late', 'soon'])
  })

  it('does not mutate the input', () => {
    const original = [...tasks]
    sortTasks(tasks, 'dueDate')
    expect(tasks).toEqual(original)
  })
})

describe('computeStats', () => {
  it('summarises open, done, due-today, and overdue work', () => {
    const tasks = [
      makeTask({ id: 'a', dueDate: TODAY, priority: 'high' }),
      makeTask({ id: 'b', dueDate: day(-1), priority: 'high' }),
      makeTask({ id: 'c', dueDate: null, priority: 'low' }),
      makeTask({ id: 'd', completed: true, priority: 'high' }),
    ]
    expect(computeStats(tasks, NOW)).toEqual({
      total: 4,
      completed: 1,
      remaining: 3,
      // "Due today" deliberately includes the overdue task: it is the work that
      // needs doing now. This matches the Today sidebar scope and its count.
      dueToday: 2,
      overdue: 1,
      completionRate: 0.25,
      highPriorityShare: 2 / 3,
    })
  })

  it('returns zeroes rather than dividing by zero when empty', () => {
    expect(computeStats([], NOW)).toEqual({
      total: 0,
      completed: 0,
      remaining: 0,
      dueToday: 0,
      overdue: 0,
      completionRate: 0,
      highPriorityShare: 0,
    })
  })

  it('excludes completed work from the overdue count', () => {
    const tasks = [makeTask({ id: 'a', dueDate: day(-5), completed: true })]
    expect(computeStats(tasks, NOW).overdue).toBe(0)
  })
})

describe('computeViewCounts', () => {
  it('counts each scope independently', () => {
    const tasks = [
      makeTask({ id: 'a', dueDate: TODAY }),
      makeTask({ id: 'b', dueDate: day(-2) }), // overdue, so also "today"
      makeTask({ id: 'c', dueDate: day(3) }),
      makeTask({ id: 'd', dueDate: null }),
      makeTask({ id: 'e', completed: true }),
    ]
    expect(computeViewCounts(tasks, NOW)).toEqual({
      all: 4, // open only
      today: 2, // due today + overdue
      upcoming: 1,
      completed: 1,
    })
  })
})

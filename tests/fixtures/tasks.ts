/**
 * Task fixtures.
 *
 * `makeTask` fills in every field so each test only has to state the one thing
 * it is actually about. Overriding is done with a partial, which keeps tests
 * from being full of required-but-irrelevant fields.
 */

import type { Priority, Subtask, Task, TaskSource } from '../../shared/task.ts'

export function makeSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: 'sub-1',
    title: 'A subtask',
    completed: false,
    ...overrides,
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Write the report',
    description: '',
    completed: false,
    priority: 'medium',
    dueDate: null,
    subtasks: [],
    source: 'manual',
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  }
}

/** Convenience for the many tests that only care about a priority value. */
export function makeTasksWithPriorities(...priorities: Priority[]): Task[] {
  return priorities.map((priority, index) =>
    makeTask({ id: `task-${index}`, title: `Task ${index}`, priority }),
  )
}

export function makeTaskWithSource(source: TaskSource, overrides: Partial<Task> = {}): Task {
  return makeTask({ source, ...overrides })
}

/** A fixed "now" so date-dependent assertions do not drift with the wall clock. */
export const NOW = new Date(2026, 0, 15, 12, 0, 0) // 15 Jan 2026, local time
export const TODAY = '2026-01-15'

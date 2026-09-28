/**
 * The task reducer: every mutation to task state lives here.
 *
 * The reducer is pure — no clocks, no randomness, no storage. Ids and
 * timestamps are passed in, which is what makes the whole task domain testable
 * without mocking Date or crypto. Callers use the `createTask` factory below to
 * obtain those values.
 */

import type { CreateTaskInput, Priority, Subtask, Task, TaskSource, UpdateTaskInput } from '../../../shared/task.ts'
import { PRIORITIES } from '../../../shared/task.ts'
import { isValidDateKey } from '../../../shared/dates.ts'
import { MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE } from './task-schema.ts'

export type TaskAction =
  | { type: 'hydrate'; tasks: Task[] }
  | { type: 'add'; task: Task }
  | { type: 'addMany'; tasks: Task[] }
  | { type: 'update'; id: string; patch: UpdateTaskInput; now: string }
  | { type: 'toggle'; id: string; now: string }
  | { type: 'remove'; id: string }
  | { type: 'toggleSubtask'; taskId: string; subtaskId: string; now: string }
  | { type: 'replaceAll'; tasks: Task[] }

export function taskReducer(state: Task[], action: TaskAction): Task[] {
  switch (action.type) {
    case 'hydrate':
    case 'replaceAll':
      return action.tasks

    case 'add':
      return [action.task, ...state]

    case 'addMany':
      return [...action.tasks, ...state]

    case 'update':
      return state.map((task) => {
        if (task.id !== action.id) return task
        return applyPatch(task, action.patch, action.now)
      })

    case 'toggle':
      return state.map((task) => {
        if (task.id !== action.id) return task
        const completed = !task.completed
        return {
          ...task,
          completed,
          // Finishing a task completes its subtasks too, or the progress bars
          // would disagree with the parent state.
          subtasks: completed
            ? task.subtasks.map((subtask) => ({ ...subtask, completed: true }))
            : task.subtasks,
          updatedAt: action.now,
        }
      })

    case 'remove':
      return state.filter((task) => task.id !== action.id)

    case 'toggleSubtask':
      return state.map((task) => {
        if (task.id !== action.taskId) return task
        const subtasks = task.subtasks.map((subtask) =>
          subtask.id === action.subtaskId ? { ...subtask, completed: !subtask.completed } : subtask,
        )
        // A parent with subtasks cannot be complete while any subtask is open.
        const completed = subtasks.length > 0 ? subtasks.every((subtask) => subtask.completed) : task.completed
        return { ...task, subtasks, completed, updatedAt: action.now }
      })

    default:
      return state
  }
}

/** Applies a patch, normalising and rejecting invalid field values. */
function applyPatch(task: Task, patch: UpdateTaskInput, now: string): Task {
  const next: Task = { ...task, updatedAt: now }

  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (title.length > 0) next.title = title.slice(0, MAX_TITLE)
  }

  if (patch.description !== undefined) {
    next.description = patch.description.trim().slice(0, MAX_DESCRIPTION)
  }

  if (patch.priority !== undefined && isPriority(patch.priority)) {
    next.priority = patch.priority
  }

  if (patch.dueDate !== undefined) {
    next.dueDate = patch.dueDate === null || isValidDateKey(patch.dueDate) ? patch.dueDate : task.dueDate
  }

  if (patch.completed !== undefined) {
    next.completed = patch.completed
  }

  if (patch.subtasks !== undefined) {
    next.subtasks = patch.subtasks
      .map((title) => title.trim())
      .filter((title) => title.length > 0)
      .slice(0, MAX_SUBTASKS)
      .map((title, index) => ({
        id: `${task.id}:s${index}`,
        title: title.slice(0, 200),
        completed: false,
      }))
    // Adding open subtasks means the parent is no longer complete.
    if (next.subtasks.length > 0 && patch.subtasks.some((title) => title.trim().length > 0)) {
      next.completed = false
    }
  }

  return next
}

function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)
}

/* -------------------------------------------------------------------------- */
/*  Factories — the impure bits, kept out of the reducer                       */
/* -------------------------------------------------------------------------- */

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** Builds a fully-formed task from user input, applying the same limits as storage validation. */
export function createTask(
  input: CreateTaskInput,
  options: { id?: string; now?: string; subtaskIds?: (index: number) => string } = {},
): Task {
  const id = options.id ?? newId()
  const now = options.now ?? new Date().toISOString()
  const idForSubtask = options.subtaskIds ?? ((index: number) => `${id}:s${index}`)

  const title = input.title.trim().slice(0, MAX_TITLE)
  const description = (input.description ?? '').trim().slice(0, MAX_DESCRIPTION)
  const source: TaskSource = input.source === 'ai' ? 'ai' : 'manual'
  const dueDate =
    input.dueDate !== undefined && (input.dueDate === null || isValidDateKey(input.dueDate))
      ? input.dueDate
      : null

  const subtasks: Subtask[] = (input.subtasks ?? [])
    .map((raw) => raw.trim().slice(0, 200))
    .filter((raw) => raw.length > 0)
    .slice(0, MAX_SUBTASKS)
    .map((raw, index) => ({ id: idForSubtask(index), title: raw, completed: false }))

  return {
    id,
    title: title.length > 0 ? title : 'Untitled task',
    description,
    completed: false,
    priority: input.priority && isPriority(input.priority) ? input.priority : 'medium',
    dueDate,
    subtasks,
    source,
    createdAt: now,
    updatedAt: now,
  }
}

/** Progress of a task's subtasks, as a 0–1 ratio. `null` when there are none. */
export function subtaskProgress(task: Task): { done: number; total: number; ratio: number } | null {
  const total = task.subtasks.length
  if (total === 0) return null
  const done = task.subtasks.filter((subtask) => subtask.completed).length
  return { done, total, ratio: done / total }
}

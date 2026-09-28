/**
 * The Task domain model.
 *
 * This module is the single source of truth for task shape and is imported by
 * BOTH the browser bundle and the serverless functions. Keep it free of any
 * browser or Node API so it stays importable from both environments.
 */

export const PRIORITIES = ['low', 'medium', 'high'] as const

export type Priority = (typeof PRIORITIES)[number]

export const TASK_SOURCES = ['manual', 'ai'] as const

/** Where a task came from. AI-created tasks are always `ai` so they stay identifiable. */
export type TaskSource = (typeof TASK_SOURCES)[number]

export interface Subtask {
  id: string
  title: string
  completed: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  completed: boolean
  priority: Priority
  /**
   * Calendar date in `YYYY-MM-DD` form, or null when the task has no deadline.
   *
   * Deliberately a date-only string rather than an ISO timestamp: "next Friday"
   * is a wall-clock concept, and storing a timestamp would make the same task
   * render as a different day depending on the viewer's timezone.
   */
  dueDate: string | null
  subtasks: Subtask[]
  source: TaskSource
  createdAt: string
  updatedAt: string
}

/** Fields a user may supply when creating a task. Server timestamps/ids are generated for them. */
export interface CreateTaskInput {
  title: string
  description?: string
  priority?: Priority
  dueDate?: string | null
  source?: TaskSource
  subtasks?: string[]
}

/** Fields a user may change on an existing task. */
export type UpdateTaskInput = Partial<Omit<CreateTaskInput, 'source'>> & {
  completed?: boolean
}

/**
 * Runtime validation for the Task model.
 *
 * The Zod schema here is the authority for what a valid task is. The domain
 * types in `shared/task.ts` describe the intended shape; this module enforces
 * it at runtime, which matters because tasks are read back from `localStorage`
 * that any user (or an older version of the app) could have written.
 */

import { z } from 'zod'

import { isValidDateKey } from '../../../shared/dates.ts'
import { PRIORITIES, TASK_SOURCES, type Task } from '../../../shared/task.ts'

const MAX_TITLE = 200
const MAX_DESCRIPTION = 2000
const MAX_SUBTASKS = 40

const isoTimestamp = z.string().min(1).max(40)

export const subtaskSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  completed: z.boolean(),
})

export const taskSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(MAX_TITLE),
  description: z.string().max(MAX_DESCRIPTION),
  completed: z.boolean(),
  priority: z.enum(PRIORITIES),
  dueDate: z.string().refine(isValidDateKey, { message: 'Invalid due date' }).nullable(),
  subtasks: z.array(subtaskSchema).max(MAX_SUBTASKS),
  source: z.enum(TASK_SOURCES),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const taskListSchema = z.array(taskSchema)

/**
 * Coerces unknown stored data into tasks, discarding anything malformed.
 *
 * Storage is a trust boundary: it can hold data from a future schema version, a
 * partial write, or a hand edit. Rather than throwing away the whole list
 * because one entry is bad, unusable entries are dropped and the rest survive —
 * losing one task is strictly better than losing all of them.
 */
export function parseStoredTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return []
  const result: Task[] = []
  for (const entry of value) {
    const parsed = taskSchema.safeParse(entry)
    if (parsed.success) result.push(parsed.data)
  }
  return result
}

export { MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE }

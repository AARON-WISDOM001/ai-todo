/**
 * Task persistence.
 *
 * Storage is `localStorage` behind a narrow interface. That is a deliberate
 * trade-off for this project: it gives real durability across refreshes with no
 * database to provision, and it keeps the whole data layer inside one file that
 * can be swapped for an API client without touching the reducer or the UI.
 *
 * The costs are stated plainly rather than hidden: data is per-browser, there is
 * no sync across devices, and storage is bounded by quota. See the README's
 * "Trade-offs" section.
 */

import type { Task } from '../../../shared/task.ts'
import { parseStoredTasks } from './task-schema.ts'

const STORAGE_KEY = 'ai-todo:tasks:v1'

/** The surface the UI depends on. A future API-backed implementation matches this. */
export interface TaskRepository {
  load(): Task[]
  save(tasks: Task[]): void
  clear(): void
}

export type StorageFailure = { ok: false; reason: 'unavailable' | 'quota' | 'unknown' }

class LocalStorageTaskRepository implements TaskRepository {
  // Written as an explicit field rather than a constructor parameter property,
  // which `erasableSyntaxOnly` forbids.
  private readonly key: string

  constructor(key: string = STORAGE_KEY) {
    this.key = key
  }

  load(): Task[] {
    const raw = this.read()
    if (raw === null) return []
    try {
      return parseStoredTasks(JSON.parse(raw))
    } catch {
      // Corrupt JSON. Drop it so the app starts clean instead of wedging.
      this.clear()
      return []
    }
  }

  save(tasks: Task[]): void {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(tasks))
    } catch (error) {
      throw toStorageFailure(error)
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(this.key)
    } catch {
      // Nothing actionable: the value is already unreachable or storage is gone.
    }
  }

  private read(): string | null {
    try {
      return window.localStorage.getItem(this.key)
    } catch {
      // Private browsing, disabled storage, or a sandboxed iframe.
      return null
    }
  }
}

function toStorageFailure(error: unknown): StorageFailure {
  const name = error instanceof Error ? error.name : ''
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return { ok: false, reason: 'quota' }
  }
  if (name === 'SecurityError') return { ok: false, reason: 'unavailable' }
  return { ok: false, reason: 'unknown' }
}

export const taskRepository: TaskRepository = new LocalStorageTaskRepository()

/** Maps a storage failure onto a sentence a user can act on. */
export function describeStorageFailure(failure: StorageFailure): string {
  switch (failure.reason) {
    case 'quota':
      return 'Your browser storage is full, so this change could not be saved. Try removing some completed tasks.'
    case 'unavailable':
      return 'Your browser is blocking local storage, so changes will not be saved after you refresh.'
    default:
      return 'Your changes could not be saved. They will last until you refresh the page.'
  }
}

export { STORAGE_KEY }

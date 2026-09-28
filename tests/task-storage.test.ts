import { describe, expect, it } from 'vitest'

import { parseStoredTasks, taskSchema } from '../src/features/tasks/task-schema.ts'
import { STORAGE_KEY, describeStorageFailure, taskRepository } from '../src/features/tasks/task-repository.ts'
import { TODAY, makeTask } from './fixtures/tasks.ts'

describe('taskSchema', () => {
  it('accepts a well-formed task', () => {
    expect(taskSchema.safeParse(makeTask()).success).toBe(true)
  })

  it('rejects an impossible due date', () => {
    expect(taskSchema.safeParse(makeTask({ dueDate: '2026-02-30' })).success).toBe(false)
  })

  it('accepts a null due date', () => {
    expect(taskSchema.safeParse(makeTask({ dueDate: null })).success).toBe(true)
  })

  it('rejects an unknown priority or source', () => {
    expect(taskSchema.safeParse(makeTask({ priority: 'urgent' as never })).success).toBe(false)
    expect(taskSchema.safeParse(makeTask({ source: 'imported' as never })).success).toBe(false)
  })
})

describe('parseStoredTasks', () => {
  it('keeps valid entries and drops malformed ones', () => {
    // Storage is a trust boundary; losing one task beats losing all of them.
    const stored = [
      makeTask({ id: 'good-1' }),
      { id: 'bad', title: 'No type info' },
      makeTask({ id: 'good-2' }),
      null,
      'a string, not a task',
    ]
    expect(parseStoredTasks(stored).map((task) => task.id)).toEqual(['good-1', 'good-2'])
  })

  it('returns an empty list for anything that is not an array', () => {
    expect(parseStoredTasks(null)).toEqual([])
    expect(parseStoredTasks({ tasks: [] })).toEqual([])
    expect(parseStoredTasks('[]')).toEqual([])
  })
})

describe('localStorage repository', () => {
  it('round-trips tasks', () => {
    const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b', dueDate: TODAY })]
    taskRepository.save(tasks)
    expect(taskRepository.load()).toEqual(tasks)
  })

  it('starts empty when nothing is stored', () => {
    expect(taskRepository.load()).toEqual([])
  })

  it('returns an empty list when storage holds invalid JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(taskRepository.load()).toEqual([])
  })

  it('discards corrupt JSON rather than leaving it to fail again', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    taskRepository.load()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('survives a task written by a newer version of the app', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeTask({ id: 'known' }), { id: 'unknown', extraField: 1 }]),
    )
    expect(taskRepository.load().map((task) => task.id)).toEqual(['known'])
  })

  it('clears storage', () => {
    taskRepository.save([makeTask()])
    taskRepository.clear()
    expect(taskRepository.load()).toEqual([])
  })

  it('does not throw when the browser blocks storage', () => {
    const original = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')
    Object.defineProperty(Storage.prototype, 'getItem', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    try {
      expect(taskRepository.load()).toEqual([])
    } finally {
      if (original) Object.defineProperty(Storage.prototype, 'getItem', original)
    }
  })
})

describe('describeStorageFailure', () => {
  it('gives an actionable sentence per failure kind', () => {
    expect(describeStorageFailure({ ok: false, reason: 'quota' })).toMatch(/storage is full/i)
    expect(describeStorageFailure({ ok: false, reason: 'unavailable' })).toMatch(/blocking/i)
    expect(describeStorageFailure({ ok: false, reason: 'unknown' })).toMatch(/until you refresh/i)
  })
})

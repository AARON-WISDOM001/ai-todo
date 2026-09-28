import { describe, expect, it } from 'vitest'

import {
  createTask,
  newId,
  subtaskProgress,
  taskReducer,
  type TaskAction,
} from '../src/features/tasks/task-reducer.ts'
import { MAX_SUBTASKS, MAX_TITLE } from '../src/features/tasks/task-schema.ts'
import { TODAY, makeSubtask, makeTask } from './fixtures/tasks.ts'

const T0 = '2026-01-15T09:00:00.000Z'
const T1 = '2026-01-15T10:00:00.000Z'

function reduce(state: ReturnType<typeof makeTask>[], ...actions: TaskAction[]) {
  return actions.reduce(taskReducer, state)
}

describe('createTask', () => {
  it('applies defaults and trims input', () => {
    const task = createTask({ title: '  Buy milk  ' }, { id: 'x', now: T0 })
    expect(task).toMatchObject({
      id: 'x',
      title: 'Buy milk',
      description: '',
      completed: false,
      priority: 'medium',
      dueDate: null,
      source: 'manual',
      createdAt: T0,
      updatedAt: T0,
    })
  })

  it('never records an AI task as manual, and never a manual task as AI', () => {
    expect(createTask({ title: 'a', source: 'ai' }).source).toBe('ai')
    expect(createTask({ title: 'a' }).source).toBe('manual')
    expect(createTask({ title: 'a', source: 'manual' }).source).toBe('manual')
  })

  it('rejects an impossible due date rather than storing it', () => {
    expect(createTask({ title: 'a', dueDate: '2026-02-30' }).dueDate).toBeNull()
    expect(createTask({ title: 'a', dueDate: TODAY }).dueDate).toBe(TODAY)
    expect(createTask({ title: 'a', dueDate: null }).dueDate).toBeNull()
  })

  it('falls back to a placeholder for a blank title so a task is never nameless', () => {
    expect(createTask({ title: '   ' }).title).toBe('Untitled task')
  })

  it('gives subtasks ids scoped to the task and drops blank ones', () => {
    const task = createTask({ title: 'a', subtasks: [' one ', '', '  ', 'two'] }, { id: 'p' })
    expect(task.subtasks).toEqual([
      { id: 'p:s0', title: 'one', completed: false },
      { id: 'p:s1', title: 'two', completed: false },
    ])
  })

  it('caps subtitle count to the storage limit', () => {
    const many = Array.from({ length: MAX_SUBTASKS + 10 }, (_, index) => `step ${index}`)
    expect(createTask({ title: 'a', subtasks: many }).subtasks).toHaveLength(MAX_SUBTASKS)
  })

  it('generates a unique id per call', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()))
    expect(ids.size).toBe(50)
  })
})

describe('taskReducer: create', () => {
  it('adds a task at the top of the list', () => {
    const state = reduce([makeTask({ id: 'old' })], { type: 'add', task: makeTask({ id: 'new' }) })
    expect(state.map((task) => task.id)).toEqual(['new', 'old'])
  })

  it('adds a batch in the order given, ahead of existing tasks', () => {
    const state = reduce([makeTask({ id: 'existing' })], {
      type: 'addMany',
      tasks: [makeTask({ id: 'b1' }), makeTask({ id: 'b2' })],
    })
    expect(state.map((task) => task.id)).toEqual(['b1', 'b2', 'existing'])
  })
})

describe('taskReducer: update', () => {
  it('edits fields and stamps updatedAt', () => {
    const [task] = reduce([makeTask({ updatedAt: T0 })], {
      type: 'update',
      id: 'task-1',
      patch: { title: '  Renamed  ', priority: 'high' },
      now: T1,
    })
    expect(task?.title).toBe('Renamed')
    expect(task?.priority).toBe('high')
    expect(task?.updatedAt).toBe(T1)
  })

  it('leaves other tasks untouched and does not mutate state', () => {
    const original = [makeTask({ id: 'task-1' })]
    const snapshot = structuredClone(original)
    reduce(original, { type: 'update', id: 'task-1', patch: { title: 'Changed' }, now: T1 })
    expect(original).toEqual(snapshot)
  })

  it('ignores a blank title, an unknown priority, and an invalid date', () => {
    const [task] = reduce([makeTask({ title: 'Keep', priority: 'low', dueDate: TODAY })], {
      type: 'update',
      id: 'task-1',
      patch: { title: '   ', priority: 'urgent' as never, dueDate: '2026-02-30' },
      now: T1,
    })
    expect(task?.title).toBe('Keep')
    expect(task?.priority).toBe('low')
    expect(task?.dueDate).toBe(TODAY)
  })

  it('truncates an over-long title instead of storing it', () => {
    const [task] = reduce([makeTask()], {
      type: 'update',
      id: 'task-1',
      patch: { title: 'x'.repeat(MAX_TITLE + 50) },
      now: T1,
    })
    expect(task?.title).toHaveLength(MAX_TITLE)
  })

  it('reopens a task when open subtasks are added', () => {
    const [task] = reduce([makeTask({ completed: true })], {
      type: 'update',
      id: 'task-1',
      patch: { subtasks: ['new work'] },
      now: T1,
    })
    expect(task?.completed).toBe(false)
    expect(task?.subtasks).toHaveLength(1)
  })

  it('is a no-op for an unknown id', () => {
    const state = reduce([makeTask()], { type: 'update', id: 'nope', patch: { title: 'x' }, now: T1 })
    expect(state[0]?.title).toBe('Write the report')
  })
})

describe('taskReducer: complete', () => {
  it('marks a task complete and completes its subtasks', () => {
    const [task] = reduce(
      [makeTask({ subtasks: [makeSubtask(), makeSubtask({ id: 's2' })] })],
      { type: 'toggle', id: 'task-1', now: T1 },
    )
    expect(task?.completed).toBe(true)
    expect(task?.subtasks.every((subtask) => subtask.completed)).toBe(true)
  })

  it('reopens without discarding subtask progress', () => {
    const [task] = reduce(
      [makeTask({ completed: true, subtasks: [makeSubtask({ completed: true })] })],
      { type: 'toggle', id: 'task-1', now: T1 },
    )
    expect(task?.completed).toBe(false)
    expect(task?.subtasks[0]?.completed).toBe(true)
  })

  it('completes a parent once every subtask is done', () => {
    const withSubtasks = makeTask({
      subtasks: [makeSubtask({ id: 's1', completed: true }), makeSubtask({ id: 's2' })],
    })
    const [task] = reduce([withSubtasks], {
      type: 'toggleSubtask',
      taskId: 'task-1',
      subtaskId: 's2',
      now: T1,
    })
    expect(task?.completed).toBe(true)
  })

  it('reopens a parent when a subtask is unchecked', () => {
    const withSubtasks = makeTask({
      completed: true,
      subtasks: [makeSubtask({ id: 's1', completed: true })],
    })
    const [task] = reduce([withSubtasks], {
      type: 'toggleSubtask',
      taskId: 'task-1',
      subtaskId: 's1',
      now: T1,
    })
    expect(task?.completed).toBe(false)
  })
})

describe('taskReducer: delete', () => {
  it('removes only the target task', () => {
    const state = reduce([makeTask({ id: 'a' }), makeTask({ id: 'b' })], { type: 'remove', id: 'a' })
    expect(state.map((task) => task.id)).toEqual(['b'])
  })

  it('ignores an unknown id', () => {
    const state = reduce([makeTask({ id: 'a' })], { type: 'remove', id: 'zzz' })
    expect(state).toHaveLength(1)
  })

  it('drops every entry when all tasks are removed', () => {
    expect(reduce([makeTask({ id: 'a' })], { type: 'remove', id: 'a' })).toEqual([])
  })
})

describe('taskReducer: hydrate and replaceAll', () => {
  it('replaces the list wholesale', () => {
    const next = [makeTask({ id: 'x' })]
    expect(reduce([makeTask({ id: 'old' })], { type: 'hydrate', tasks: next })).toEqual(next)
    expect(reduce([makeTask({ id: 'old' })], { type: 'replaceAll', tasks: [] })).toEqual([])
  })
})

describe('subtaskProgress', () => {
  it('is null when there are no subtasks', () => {
    expect(subtaskProgress(makeTask())).toBeNull()
  })

  it('reports the ratio', () => {
    const task = makeTask({
      subtasks: [makeSubtask({ completed: true }), makeSubtask({ id: 's2' })],
    })
    expect(subtaskProgress(task)).toEqual({ done: 1, total: 2, ratio: 0.5 })
  })
})

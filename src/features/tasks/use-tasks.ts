/**
 * The single owner of task state.
 *
 * Reads synchronously from storage on first render — `localStorage` is
 * synchronous, so there is no real loading phase to fake. That keeps the app
 * from flashing an empty state before the user's tasks appear, and it means the
 * only genuine loading state in the product is an in-flight AI request, which
 * is honest rather than decorative.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import type { CreateTaskInput, Task, UpdateTaskInput } from '../../../shared/task.ts'
import { createTask, newId, taskReducer } from './task-reducer.ts'
import { describeStorageFailure, taskRepository, type StorageFailure } from './task-repository.ts'
import { computeStats, computeViewCounts, type TaskStats } from './task-selectors.ts'

export interface TaskNotice {
  id: string
  tone: 'error' | 'success' | 'info'
  message: string
}

export interface UseTasksResult {
  tasks: Task[]
  stats: TaskStats
  viewCounts: ReturnType<typeof computeViewCounts>
  notice: TaskNotice | null
  dismissNotice: () => void
  addTask: (input: CreateTaskInput) => Task
  addTasks: (inputs: CreateTaskInput[]) => Task[]
  updateTask: (id: string, patch: UpdateTaskInput) => void
  toggleTask: (id: string) => void
  removeTask: (id: string) => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
  clearCompleted: () => void
  getTask: (id: string) => Task | undefined
}

function now(): string {
  return new Date().toISOString()
}

export function useTasks(): UseTasksResult {
  const [tasks, dispatch] = useReducer(taskReducer, undefined, () => taskRepository.load())
  const [notice, setNotice] = useState<TaskNotice | null>(null)

  // The first render must not write back: saving the freshly-read state would be
  // a pointless write, and a write failure would surface a spurious error.
  const hydrated = useRef(false)

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    try {
      taskRepository.save(tasks)
    } catch (error) {
      setNotice({
        id: newId(),
        tone: 'error',
        message: describeStorageFailure(error as StorageFailure),
      })
    }
  }, [tasks])

  const dismissNotice = useCallback(() => setNotice(null), [])

  const addTask = useCallback((input: CreateTaskInput): Task => {
    const id = newId()
    const timestamp = now()
    const task = createTask(input, {
      id,
      now: timestamp,
      subtaskIds: (index) => `${id}:s${index}`,
    })
    dispatch({ type: 'add', task })
    return task
  }, [])

  /**
   * Adds several tasks at once, preserving the order they were reviewed in.
   *
   * Ids and timestamps are generated in a single pass with one clock reading so
   * a batch of AI proposals is internally consistent rather than ordered by
   * whichever call happened to resolve last.
   */
  const addTasks = useCallback((inputs: CreateTaskInput[]): Task[] => {
    if (inputs.length === 0) return []
    const timestamp = now()
    const batch = inputs.map((input) => {
      const id = newId()
      return createTask(input, { id, now: timestamp, subtaskIds: (index) => `${id}:s${index}` })
    })
    dispatch({ type: 'addMany', tasks: batch })
    return batch
  }, [])

  const updateTask = useCallback((id: string, patch: UpdateTaskInput) => {
    dispatch({ type: 'update', id, patch, now: now() })
  }, [])

  const toggleTask = useCallback((id: string) => {
    dispatch({ type: 'toggle', id, now: now() })
  }, [])

  const removeTask = useCallback((id: string) => {
    dispatch({ type: 'remove', id })
  }, [])

  const toggleSubtask = useCallback((taskId: string, subtaskId: string) => {
    dispatch({ type: 'toggleSubtask', taskId, subtaskId, now: now() })
  }, [])

  const clearCompleted = useCallback(() => {
    dispatch({ type: 'replaceAll', tasks: tasks.filter((task) => !task.completed) })
  }, [tasks])

  const getTask = useCallback((id: string) => tasks.find((task) => task.id === id), [tasks])

  const stats = useMemo(() => computeStats(tasks), [tasks])
  const viewCounts = useMemo(() => computeViewCounts(tasks), [tasks])

  return {
    tasks,
    stats,
    viewCounts,
    notice,
    dismissNotice,
    addTask,
    addTasks,
    updateTask,
    toggleTask,
    removeTask,
    toggleSubtask,
    clearCompleted,
    getTask,
  }
}

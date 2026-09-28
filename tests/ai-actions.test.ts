/**
 * Tests for the four AI actions.
 *
 * `generateStructured` is mocked, because these tests are about what the actions
 * do with a model reply, not about the network. The important case is
 * `prioritize`, which must not let an unrecognised id reach the UI.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TODAY } from './fixtures/tasks.ts'

const generateStructured = vi.hoisted(() => vi.fn())

vi.mock('../server/ai/client.ts', () => ({ generateStructured }))

const { breakDownTask, createTasks, improveTask, prioritize } = await import(
  '../server/ai/actions.ts'
)

const dateContext = { today: TODAY, timezone: 'Africa/Lagos' }

beforeEach(() => {
  generateStructured.mockReset()
})

describe('createTasks', () => {
  it('sends the instruction and date context, and returns validated proposals', async () => {
    const reply = {
      tasks: [{ title: 'Submit report', description: '', priority: 'high' as const, dueDate: TODAY, rationale: null }],
      notes: null,
    }
    generateStructured.mockResolvedValue(reply)

    const result = await createTasks({ ...dateContext, input: 'submit my report friday' })

    expect(result).toEqual(reply)
    const call = generateStructured.mock.calls[0]![0]
    expect(call.prompt).toContain('submit my report friday')
    expect(call.system).toContain(TODAY) // so "friday" resolves correctly
    expect(call.schemaName).toBe('TaskExtraction')
  })
})

describe('breakDownTask', () => {
  it('sends the task being broken down', async () => {
    const reply = { steps: [{ title: 'Collect data', rationale: null }], notes: null }
    generateStructured.mockResolvedValue(reply)

    const result = await breakDownTask({
      ...dateContext,
      taskId: 't1',
      title: 'Build the model',
      description: 'Train and evaluate.',
      dueDate: TODAY,
    })

    expect(result).toEqual(reply)
    const call = generateStructured.mock.calls[0]![0]
    // Instructions go in the system turn; the task itself is the user turn.
    expect(call.system).toContain('You break a single large task')
    expect(call.prompt).toContain('Build the model')
    expect(call.prompt).toContain('Train and evaluate.')
    expect(call.prompt).toContain(TODAY)
    expect(call.schemaName).toBe('TaskBreakdown')
  })

  it('works for a task with no description or due date', async () => {
    generateStructured.mockResolvedValue({ steps: [{ title: 'a', rationale: null }], notes: null })
    await expect(
      breakDownTask({ ...dateContext, taskId: 't1', title: 'Do it' }),
    ).resolves.toBeTruthy()
  })
})

describe('improveTask', () => {
  it('sends the current wording and uses a higher temperature', async () => {
    generateStructured.mockResolvedValue({
      title: 'Submit report',
      description: 'Include results.',
      rationale: null,
    })

    const result = await improveTask({ ...dateContext, title: 'do the report thing', description: 'results' })

    expect(result.title).toBe('Submit report')
    const call = generateStructured.mock.calls[0]![0]
    expect(call.prompt).toContain('do the report thing')
    expect(call.prompt).toContain('results')
    // Rewriting benefits from variety, unlike extraction.
    expect(call.temperature).toBeGreaterThan(0.3)
  })
})

describe('prioritize', () => {
  const tasks = [
    { id: 'a', title: 'Report', priority: 'high' as const, dueDate: TODAY, completed: false, remainingSubtasks: 2 },
    { id: 'b', title: 'Email', priority: 'low' as const, dueDate: null, completed: false, remainingSubtasks: 0 },
    { id: 'c', title: 'Setup', priority: 'medium' as const, dueDate: null, completed: true, remainingSubtasks: 0 },
  ]

  it('drops ids the model invented', async () => {
    // "Only echo ids we sent" is a request, not a guarantee. An unrecognised id
    // must never reach the UI as a focus target.
    generateStructured.mockResolvedValue({
      focusTaskId: 'hallucinated-id',
      headline: 'Start the report.',
      reasoning: 'It is due today.',
      suggestedOrder: ['a', 'ghost-task', 'b', 'another-ghost'],
    })

    const result = await prioritize({ ...dateContext, tasks })

    expect(result.focusTaskId).toBeNull()
    expect(result.suggestedOrder).toEqual(['a', 'b'])
  })

  it('keeps a focus task and order the model got right', async () => {
    generateStructured.mockResolvedValue({
      focusTaskId: 'a',
      headline: 'Start the report.',
      reasoning: 'It is due today and has two subtasks left.',
      suggestedOrder: ['a', 'b'],
    })

    const result = await prioritize({ ...dateContext, tasks })
    expect(result.focusTaskId).toBe('a')
    expect(result.suggestedOrder).toEqual(['a', 'b'])
  })

  it('separates open work from completed work in the context it sends', async () => {
    generateStructured.mockResolvedValue({
      focusTaskId: 'a',
      headline: 'x',
      reasoning: 'y',
      suggestedOrder: ['a'],
    })

    await prioritize({ ...dateContext, tasks })
    const call = generateStructured.mock.calls[0]![0]

    expect(call.prompt).toContain('Open tasks (2)')
    expect(call.prompt).toContain('Recently completed (1)')
    expect(call.prompt).toContain('[a] Report')
    expect(call.prompt).toContain('2 subtasks left')
  })

  it('copes with an empty list', async () => {
    generateStructured.mockResolvedValue({
      focusTaskId: null,
      headline: 'Nothing to do.',
      reasoning: 'Your list is clear.',
      suggestedOrder: [],
    })

    const result = await prioritize({
      ...dateContext,
      tasks: [{ ...tasks[0]!, id: 'only', completed: false }],
    })
    expect(result.headline).toBe('Nothing to do.')
  })
})

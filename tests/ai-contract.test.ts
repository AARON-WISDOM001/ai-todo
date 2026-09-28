import { describe, expect, it } from 'vitest'

import {
  AI_ACTIONS,
  AI_ENDPOINTS,
  aiResultSchemas,
  breakdownResponseSchema,
  createTasksResponseSchema,
  improveResponseSchema,
  prioritizeResponseSchema,
  taskProposalSchema,
} from '../shared/ai.ts'
import { TODAY } from './fixtures/tasks.ts'

describe('createTasksResponseSchema', () => {
  const valid = {
    tasks: [
      {
        title: 'Submit internship report',
        description: 'Ask the supervisor to review first.',
        priority: 'high',
        dueDate: TODAY,
        rationale: 'User said "this week" and flagged it urgent.',
      },
    ],
    notes: 'I read "this week" as Friday.',
  }

  it('accepts a well-formed proposal', () => {
    expect(createTasksResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts an empty description and null rationale', () => {
    const parsed = createTasksResponseSchema.parse({
      ...valid,
      tasks: [{ ...valid.tasks[0], description: '', rationale: null }],
    })
    expect(parsed.tasks[0]?.description).toBe('')
  })

  it('requires at least one task, so the UI is never handed nothing', () => {
    expect(createTasksResponseSchema.safeParse({ tasks: [], notes: null }).success).toBe(false)
  })

  it('rejects an impossible date from the model', () => {
    // The failure this guards: a model returning 2026-02-30, which a plain
    // string check would happily accept.
    const broken = { ...valid, tasks: [{ ...valid.tasks[0], dueDate: '2026-02-30' }] }
    expect(createTasksResponseSchema.safeParse(broken).success).toBe(false)
  })

  it('rejects an unknown priority', () => {
    const broken = { ...valid, tasks: [{ ...valid.tasks[0], priority: 'urgent' }] }
    expect(createTasksResponseSchema.safeParse(broken).success).toBe(false)
  })

  it('rejects a blank title', () => {
    const broken = { ...valid, tasks: [{ ...valid.tasks[0], title: '   ' }] }
    expect(createTasksResponseSchema.safeParse(broken).success).toBe(false)
  })

  it('strips extra keys rather than failing the whole response', () => {
    // Models add fields the contract does not know about. Discarding them is
    // better than rejecting an otherwise usable reply, and the parsed value the
    // app receives still contains only known keys.
    const noisy = { ...valid, tasks: [{ ...valid.tasks[0], isDone: true, colour: 'red' }] }
    const parsed = createTasksResponseSchema.parse(noisy)
    expect(parsed.tasks[0]).not.toHaveProperty('isDone')
    expect(parsed.tasks[0]).not.toHaveProperty('colour')
  })
})

describe('breakdownResponseSchema', () => {
  it('accepts an ordered list of steps', () => {
    const parsed = breakdownResponseSchema.parse({
      steps: [
        { title: 'Collect the datasets', rationale: null },
        { title: 'Train the baseline model', rationale: 'Establishes a reference point.' },
      ],
      notes: null,
    })
    expect(parsed.steps).toHaveLength(2)
  })

  it('rejects an empty breakdown', () => {
    expect(breakdownResponseSchema.safeParse({ steps: [], notes: null }).success).toBe(false)
  })
})

describe('prioritizeResponseSchema', () => {
  it('accepts a focus task, a verdict, and an order', () => {
    const parsed = prioritizeResponseSchema.parse({
      focusTaskId: 'task-1',
      headline: 'Start the report — it blocks your review.',
      reasoning: 'It is due Friday and three other tasks depend on it.',
      suggestedOrder: ['task-1', 'task-2'],
    })
    expect(parsed.suggestedOrder).toEqual(['task-1', 'task-2'])
  })

  it('accepts a null focus task, for when there is nothing to do', () => {
    const parsed = prioritizeResponseSchema.parse({
      focusTaskId: null,
      headline: 'You are all clear.',
      reasoning: 'No open tasks remain.',
      suggestedOrder: [],
    })
    expect(parsed.focusTaskId).toBeNull()
  })

  it('requires a headline and reasoning even when the list is empty', () => {
    const result = prioritizeResponseSchema.safeParse({
      focusTaskId: null,
      headline: '',
      reasoning: '',
      suggestedOrder: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('improveResponseSchema', () => {
  it('accepts a rewritten title and description', () => {
    const parsed = improveResponseSchema.parse({
      title: 'Submit internship report',
      description: 'Include results, then request supervisor review.',
      rationale: 'The original restated the whole sentence.',
    })
    expect(parsed.title).toBe('Submit internship report')
  })
})

describe('result envelope', () => {
  it('covers every AI action', () => {
    expect(Object.keys(aiResultSchemas).sort()).toEqual([...AI_ACTIONS].sort())
  })

  it('maps every action to an endpoint', () => {
    for (const action of AI_ACTIONS) {
      expect(AI_ENDPOINTS[action]).toBe(`/api/ai/${action}`)
    }
  })
})

describe('taskProposalSchema', () => {
  it('treats a proposal as data, not as a saved task', () => {
    // Proposals carry no id, timestamps, or completion state: the app creates
    // the task only after the user confirms.
    const parsed = taskProposalSchema.parse({
      title: 'Do the thing',
      description: '',
      priority: 'medium',
      dueDate: null,
      rationale: null,
    })
    expect(Object.keys(parsed).sort()).toEqual([
      'description',
      'dueDate',
      'priority',
      'rationale',
      'title',
    ])
  })
})

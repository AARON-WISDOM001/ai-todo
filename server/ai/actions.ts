/**
 * The four AI capabilities, each a pure function from a validated request to a
 * validated response.
 *
 * Routes stay thin (parse, delegate, serialise) and all model interaction is
 * concentrated here, so the AI surface of the app can be understood by reading
 * one file. Nothing in this file touches user data storage: every function
 * returns proposals for the user to confirm.
 */

import type {
  BreakdownResponse,
  CreateTasksResponse,
  ImproveResponse,
  PrioritizeResponse,
} from '../../shared/ai.ts'
import {
  breakdownResponseSchema,
  createTasksResponseSchema,
  improveResponseSchema,
  prioritizeResponseSchema,
  type BreakdownRequest,
  type CreateTasksRequest,
  type ImproveRequest,
  type PrioritizeRequest,
} from '../../shared/ai.ts'
import { generateStructured } from './client.ts'
import {
  breakdownPrompt,
  createTasksPrompt,
  improvePrompt,
  prioritizePrompt,
} from './prompts.ts'

/** Human-readable framing sent alongside the task list, so the model sees state. */
function describeTasks(tasks: PrioritizeRequest['tasks']): string {
  return tasks
    .map((task) => {
      const due = task.dueDate ?? 'no due date'
      const status = task.completed ? 'completed' : 'open'
      const subtasks =
        task.remainingSubtasks > 0 ? `, ${task.remainingSubtasks} subtasks left` : ''
      return `- [${task.id}] ${task.title} (${task.priority} priority, ${due}, ${status}${subtasks})`
    })
    .join('\n')
}

export async function createTasks(request: CreateTasksRequest): Promise<CreateTasksResponse> {
  const { system, prompt } = createTasksPrompt(request.input, request.today, request.timezone)

  return generateStructured({
    system,
    prompt,
    schema: createTasksResponseSchema,
    schemaName: 'TaskExtraction',
  })
}

export async function breakDownTask(request: BreakdownRequest): Promise<BreakdownResponse> {
  const { system, prompt } = breakdownPrompt(
    request.title,
    request.description,
    request.dueDate ?? null,
    request.today,
    request.timezone,
  )

  return generateStructured({
    system,
    prompt,
    schema: breakdownResponseSchema,
    schemaName: 'TaskBreakdown',
  })
}

export async function prioritize(request: PrioritizeRequest): Promise<PrioritizeResponse> {
  const { system, prompt } = prioritizePrompt(request.today, request.timezone)

  const open = request.tasks.filter((task) => !task.completed)
  const completedRecently = request.tasks.filter((task) => task.completed)

  const context = [
    prompt,
    '',
    `Open tasks (${open.length}):`,
    open.length > 0 ? describeTasks(open) : '- none',
    '',
    `Recently completed (${completedRecently.length}):`,
    completedRecently.length > 0 ? describeTasks(completedRecently) : '- none',
  ].join('\n')

  const response = await generateStructured({
    system,
    prompt: context,
    schema: prioritizeResponseSchema,
    schemaName: 'NextTaskRecommendation',
  })

  // The model can only echo ids we sent, but "only echo" is a request, not a
  // guarantee. Drop ids we do not recognise so a hallucinated id can never
  // reach the UI as a focus target.
  const known = new Set(request.tasks.map((task) => task.id))
  const order = response.suggestedOrder.filter((id) => known.has(id))
  const focusTaskId = response.focusTaskId && known.has(response.focusTaskId)
    ? response.focusTaskId
    : null

  return { ...response, focusTaskId, suggestedOrder: order }
}

export async function improveTask(request: ImproveRequest): Promise<ImproveResponse> {
  const { system, prompt } = improvePrompt(request.today, request.timezone)

  const task = [
    `Current title: ${request.title}`,
    request.description ? `Current description: ${request.description}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return generateStructured({
    system,
    prompt: `${prompt}\n\n${task}`,
    schema: improveResponseSchema,
    schemaName: 'TaskRewrite',
    // Slightly higher than the other actions: rewriting wants variety in phrasing.
    temperature: 0.5,
  })
}

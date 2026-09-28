/**
 * The AI contract: request schemas, response schemas, and the result envelope.
 *
 * Three rules hold this file together:
 *
 *  1. The AI NEVER mutates user data. Every capability returns a *proposal*
 *     that the user must review and confirm in the UI before anything is saved.
 *  2. Model output is untrusted input. It is parsed against a Zod schema the
 *     moment it arrives and discarded if it does not conform.
 *  3. Requests and responses are validated with the same schemas used to build
 *     the Gemini response schema, so the wire format cannot drift from what the
 *     model was told to produce.
 */

import { z } from 'zod'

import { PRIORITIES } from './task.ts'
import { isValidDateKey } from './dates.ts'

export const AI_ACTIONS = ['create', 'breakdown', 'prioritize', 'improve'] as const

export type AiAction = (typeof AI_ACTIONS)[number]

export const AI_ACTION_LABELS: Record<AiAction, string> = {
  create: 'Create tasks',
  breakdown: 'Break down a task',
  prioritize: 'What should I do next?',
  improve: 'Make this clearer',
}

/* -------------------------------------------------------------------------- */
/*  Primitives                                                                 */
/* -------------------------------------------------------------------------- */

const trimmed = (max: number) => z.string().trim().min(1).max(max)

/**
 * A `YYYY-MM-DD` date the model produced.
 *
 * Zod only checks the pattern; `isValidDateKey` additionally rejects impossible
 * calendar dates like `2026-02-30`, which a regex alone would accept.
 */
const modelDateKey = z
  .string()
  .refine(isValidDateKey, { message: 'Expected a real calendar date in YYYY-MM-DD form' })

/**
 * Context the browser sends so the model can resolve relative time correctly.
 *
 * Without an explicit "today", a model asked about "next Friday" has to guess
 * the current date, and every relative deadline in the output is then wrong.
 */
export const dateContextSchema = z.object({
  today: modelDateKey,
  timezone: trimmed(64),
})

/* -------------------------------------------------------------------------- */
/*  1. Natural-language task creation                                          */
/* -------------------------------------------------------------------------- */

export const createTasksRequestSchema = dateContextSchema.extend({
  input: trimmed(2000),
})

export const taskProposalSchema = z.object({
  title: trimmed(120),
  description: z.string().trim().max(600),
  priority: z.enum(PRIORITIES),
  dueDate: modelDateKey.nullable(),
  /** One short sentence explaining a non-obvious inference, e.g. why a date was chosen. */
  rationale: z.string().trim().max(240).nullable(),
})

export const createTasksResponseSchema = z.object({
  tasks: z.array(taskProposalSchema).min(1).max(12),
  /** Surfaces ambiguity ("I read 'next Friday' as the 25th") instead of hiding it. */
  notes: z.string().trim().max(400).nullable(),
})

export type CreateTasksRequest = z.infer<typeof createTasksRequestSchema>
export type TaskProposal = z.infer<typeof taskProposalSchema>
export type CreateTasksResponse = z.infer<typeof createTasksResponseSchema>

/* -------------------------------------------------------------------------- */
/*  2. Task breakdown                                                          */
/* -------------------------------------------------------------------------- */

export const breakdownRequestSchema = dateContextSchema.extend({
  taskId: trimmed(64),
  title: trimmed(200),
  description: z.string().trim().max(1000).optional(),
  dueDate: modelDateKey.nullable().optional(),
})

export const breakdownStepSchema = z.object({
  title: trimmed(160),
  rationale: z.string().trim().max(240).nullable(),
})

export const breakdownResponseSchema = z.object({
  steps: z.array(breakdownStepSchema).min(1).max(10),
  notes: z.string().trim().max(400).nullable(),
})

export type BreakdownRequest = z.infer<typeof breakdownRequestSchema>
export type BreakdownStep = z.infer<typeof breakdownStepSchema>
export type BreakdownResponse = z.infer<typeof breakdownResponseSchema>

/* -------------------------------------------------------------------------- */
/*  3. Prioritisation / next task                                              */
/* -------------------------------------------------------------------------- */

export const taskContextSchema = z.object({
  id: trimmed(64),
  title: trimmed(200),
  priority: z.enum(PRIORITIES),
  dueDate: modelDateKey.nullable(),
  completed: z.boolean(),
  remainingSubtasks: z.number().int().min(0).max(999),
})

export const prioritizeRequestSchema = dateContextSchema.extend({
  tasks: z.array(taskContextSchema).min(1).max(100),
  /** Cap on completed tasks included in the context, so the model sees signal not noise. */
  recentCompletions: z.number().int().min(0).max(200).optional(),
})

export const prioritizeResponseSchema = z.object({
  /** Task the model recommends starting now; null when there is nothing to do. */
  focusTaskId: trimmed(64).nullable(),
  /** Short verdict, e.g. "Start the report — it is due Friday and blocks your review." */
  headline: trimmed(160),
  reasoning: trimmed(600),
  /** Recommended execution order as task ids, most urgent first. */
  suggestedOrder: z.array(trimmed(64)).max(20),
})

export type PrioritizeRequest = z.infer<typeof prioritizeRequestSchema>
export type TaskContext = z.infer<typeof taskContextSchema>
export type PrioritizeResponse = z.infer<typeof prioritizeResponseSchema>

/* -------------------------------------------------------------------------- */
/*  4. Task improvement                                                        */
/* -------------------------------------------------------------------------- */

export const improveRequestSchema = dateContextSchema.extend({
  title: trimmed(200),
  description: z.string().trim().max(1000).optional(),
})

export const improveResponseSchema = z.object({
  title: trimmed(120),
  description: z.string().trim().max(600),
  rationale: z.string().trim().max(240).nullable(),
})

export type ImproveRequest = z.infer<typeof improveRequestSchema>
export type ImproveResponse = z.infer<typeof improveResponseSchema>

/* -------------------------------------------------------------------------- */
/*  Result envelope                                                            */
/* -------------------------------------------------------------------------- */

export const AI_ERROR_CODES = [
  'validation_error',
  'not_configured',
  'ai_unavailable',
  'invalid_ai_response',
  'rate_limited',
  'internal_error',
] as const

export type AiErrorCode = (typeof AI_ERROR_CODES)[number]

export interface AiError {
  code: AiErrorCode
  /** Human-readable and safe to show a user. Never a stack trace. */
  message: string
  /** Whether retrying the same request could plausibly succeed. */
  retryable: boolean
}

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiError }

export const aiResultSchemas = {
  create: z.object({ ok: z.literal(true), data: createTasksResponseSchema }),
  breakdown: z.object({ ok: z.literal(true), data: breakdownResponseSchema }),
  prioritize: z.object({ ok: z.literal(true), data: prioritizeResponseSchema }),
  improve: z.object({ ok: z.literal(true), data: improveResponseSchema }),
} as const

/** Maps an action to the endpoint that serves it. */
export const AI_ENDPOINTS: Record<AiAction, string> = {
  create: '/api/ai/create',
  breakdown: '/api/ai/breakdown',
  prioritize: '/api/ai/prioritize',
  improve: '/api/ai/improve',
}

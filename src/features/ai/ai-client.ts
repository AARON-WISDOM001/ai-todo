/**
 * Browser-side transport for the AI endpoints.
 *
 * Every failure mode a fetch can have is collapsed into one `AiRequestError`
 * carrying a message that is safe to show a user and a `retryable` flag the UI
 * uses to decide whether to offer a retry button. Nothing throws a raw fetch or
 * parse error past this module.
 */

import { z } from 'zod'

import {
  AI_ENDPOINTS,
  aiResultSchemas,
  type AiError,
  type AiErrorCode,
  type BreakdownRequest,
  type CreateTasksRequest,
  type ImproveRequest,
  type PrioritizeRequest,
} from '../../../shared/ai.ts'

export class AiRequestError extends Error {
  readonly code: AiErrorCode | 'network'
  readonly retryable: boolean

  constructor(code: AiErrorCode | 'network', message: string, retryable: boolean) {
    super(message)
    this.name = 'AiRequestError'
    this.code = code
    this.retryable = retryable
  }
}

/** Long enough for a cold serverless start plus a model response, short enough to fail visibly. */
const TIMEOUT_MS = 30_000

interface Envelope<T> {
  ok: true
  data: T
}

/**
 * Posts to an AI endpoint and unwraps the validated envelope.
 *
 * The generic is bound to the *output* schema, so `data` is fully typed at every
 * call site without a cast — the compiler checks the response schema and the
 * caller's expectations together.
 */
async function post<T>(endpoint: string, body: unknown, schema: z.ZodType<Envelope<T>>): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AiRequestError('network', 'The AI took too long to respond. Please try again.', true)
    }
    throw new AiRequestError(
      'network',
      'We could not reach the server. Check your connection and try again.',
      true,
    )
  }
  clearTimeout(timeout)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new AiRequestError(
      'internal_error',
      'The server returned an unreadable response. Please try again.',
      true,
    )
  }

  if (!response.ok) {
    // The server always sends { ok: false, error } on failure; fall back to a
    // status-derived message if something upstream returned plain text instead.
    const error = extractError(payload)
    throw new AiRequestError(
      error?.code ?? 'internal_error',
      error?.message ?? defaultMessageForStatus(response.status),
      error?.retryable ?? response.status >= 500,
    )
  }

  // Validate on arrival too. The server already did this, but the client must
  // not depend on that having happened — a misconfigured proxy could alter it.
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new AiRequestError(
      'invalid_ai_response',
      'The AI response did not match what was expected. Please try again.',
      true,
    )
  }

  return parsed.data.data
}

function extractError(payload: unknown): AiError | null {
  if (typeof payload !== 'object' || payload === null) return null
  const error = (payload as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return null
  const candidate = error as Partial<AiError>
  if (typeof candidate.code !== 'string' || typeof candidate.message !== 'string') return null
  return {
    code: candidate.code as AiErrorCode,
    message: candidate.message,
    retryable: candidate.retryable ?? true,
  }
}

function defaultMessageForStatus(status: number): string {
  if (status === 404) return 'The AI endpoint was not found. Is the server running?'
  if (status === 429) return 'Too many AI requests. Please wait a moment and try again.'
  if (status >= 500) return 'The AI service is temporarily unavailable. Please try again.'
  return 'The request could not be completed.'
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

export const createTasks = (request: CreateTasksRequest) =>
  post(AI_ENDPOINTS.create, request, aiResultSchemas.create)

export const breakDownTask = (request: BreakdownRequest) =>
  post(AI_ENDPOINTS.breakdown, request, aiResultSchemas.breakdown)

export const prioritizeTasks = (request: PrioritizeRequest) =>
  post(AI_ENDPOINTS.prioritize, request, aiResultSchemas.prioritize)

export const improveTask = (request: ImproveRequest) =>
  post(AI_ENDPOINTS.improve, request, aiResultSchemas.improve)

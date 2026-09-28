/**
 * Request plumbing shared by every AI route: method guard, body limits, JSON
 * parsing, response writing, and a single funnel that converts any thrown value
 * into a safe `{ ok: false, error }` envelope.
 */

import type { ZodType } from 'zod'

import type { AiError, AiResult } from '../../shared/ai.ts'
import { badRequest, toAppError } from './errors.ts'
import type { ApiRequest, ApiResponse } from './contract.ts'
import { enforceRateLimit } from './rate-limit.ts'

/** Hard ceiling on request bodies. AI inputs are prompts; anything larger is abuse. */
const MAX_BODY_BYTES = 16 * 1024

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  // The API is same-origin, but lock the surface down anyway.
  'X-Content-Type-Options': 'nosniff',
} as const

export function sendJson(res: ApiResponse, status: number, payload: unknown): void {
  for (const [name, value] of Object.entries(JSON_HEADERS)) res.setHeader(name, value)
  res.statusCode = status
  res.end(JSON.stringify(payload))
}

function sendError(res: ApiResponse, error: AiError, status: number): void {
  sendJson(res, status, { ok: false, error } satisfies AiResult<never>)
}

/**
 * Parses the request body as JSON with a size limit.
 *
 * Vercel pre-parses JSON bodies into `req.body`, but the local dev middleware
 * receives a raw stream, so both shapes are handled.
 */
async function readJsonBody(req: ApiRequest): Promise<unknown> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        throw badRequest('Request body is too large.')
      }
      try {
        return JSON.parse(req.body)
      } catch {
        throw badRequest('Request body must be valid JSON.')
      }
    }
    return req.body
  }

  const raw = await readRawStream(req)
  if (raw.length === 0) throw badRequest('Request body is required.')
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw badRequest('Request body is too large.')
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw badRequest('Request body must be valid JSON.')
  }
}

/** Reads a Node IncomingMessage body, tolerating runtimes that expose no stream. */
function readRawStream(req: ApiRequest): Promise<string> {
  const stream = (req as { on?: unknown }).on
  if (typeof stream !== 'function') return Promise.resolve('')

  return new Promise<string>((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    const on = (req as unknown as {
      on: (event: string, listener: (chunk: Buffer) => void) => void
    }).on.bind(req)

    on('data', (chunk: Buffer) => {
      size += chunk.length
      // Stop buffering past the cap; the handler will reject on size.
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    on('error', () => resolve(''))
  })
}

/**
 * Wraps a route handler with everything a public endpoint needs: method check,
 * rate limiting, body parsing, schema validation, and error normalisation.
 *
 * The `run` callback receives data that has already been validated, so route
 * bodies never have to re-check shapes or think about failure envelopes.
 */
export function defineRoute<T>(
  schema: ZodType<T>,
  run: (data: T, req: ApiRequest) => Promise<AiResult<unknown>>,
) {
  return async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
    try {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendError(res, { code: 'validation_error', message: 'Use POST for this endpoint.', retryable: false }, 405)
        return
      }

      enforceRateLimit(req)

      const body = await readJsonBody(req)
      const parsed = schema.safeParse(body)
      if (!parsed.success) {
        throw badRequest(summariseIssues(parsed.error.issues))
      }

      const result = await run(parsed.data, req)
      sendJson(res, result.ok ? 200 : 502, result)
    } catch (error) {
      const appError = toAppError(error)
      if (appError.status >= 500) {
        // Full detail stays on the server; the response carries only a safe message.
        console.error('[ai-api]', appError.code, error)
      }
      sendError(res, appError.toJSON(), appError.status)
    }
  }
}

/** Turns Zod issues into one calm sentence instead of a raw issue dump. */
function summariseIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  if (issues.length === 0) return 'The request was not valid.'
  const first = issues[0]!
  const field = first.path.length > 0 ? first.path.join('.') : 'request'
  return `Invalid ${field}: ${first.message}.`
}

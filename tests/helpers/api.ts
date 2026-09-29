/**
 * Harness for driving a route handler in-process.
 *
 * The handlers take the same `(req, res)` pair Vercel gives them, so testing
 * them means handing them objects with the same shape. These stand-ins capture
 * what was written so a test can assert on the status, the headers, and the
 * body instead of on the plumbing.
 *
 * Shared by `api-routes.test.ts` and `api-http.test.ts` because a per-route
 * test file that re-declared `makeRes` five times would be five places to fix
 * the next time the response shape changed.
 */

import type { ApiRequest, ApiResponse } from '../../server/_lib/contract.ts'

export interface CapturedResponse {
  res: ApiResponse
  state: {
    status: number
    body: string
    headers: Map<string, string>
  }
}

/** Minimal stand-in for the Node response object the handlers write to. */
export function makeRes(): CapturedResponse {
  const state = { status: 0, body: '', headers: new Map<string, string>() }
  const res: ApiResponse = {
    set statusCode(value: number) {
      state.status = value
    },
    get statusCode() {
      return state.status
    },
    setHeader(name, value) {
      state.headers.set(name.toLowerCase(), value)
    },
    end(chunk) {
      state.body = chunk ?? ''
    },
  }
  return { res, state }
}

export function makeReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: 'POST',
    headers: {},
    body: { input: 'write the report', ...DATE_CONTEXT },
    ...overrides,
  }
}

/**
 * A date that is a real calendar day and is not "today", so a prompt that
 * resolves relative dates cannot accidentally agree with the answer by
 * coincidence.
 */
export const DATE_CONTEXT = { today: '2026-01-15', timezone: 'UTC' } as const

/** The `{ ok: true, data }` / `{ ok: false, error }` envelope a route writes. */
export interface ApiErrorBody {
  code: string
  message: string
  retryable: boolean
}

export type Envelope = { ok: true; data: unknown } | { ok: false; error: ApiErrorBody }

export function parseBody(state: { body: string }): Envelope {
  return JSON.parse(state.body) as Envelope
}

/**
 * The error from a response that should have failed.
 *
 * Throws if `ok` is true, which is the point: a test that read `.error` off a
 * successful response would otherwise be asserting on `undefined` and passing
 * for the wrong reason. Every failure test therefore also asserts that the
 * response really was a failure.
 */
export function expectError(state: { body: string }): ApiErrorBody {
  const body = parseBody(state)
  if (body.ok) throw new Error(`expected a failure envelope, got: ${state.body}`)
  return body.error
}

/** The `data` from a response that should have succeeded. */
export function expectData(state: { body: string }): unknown {
  const body = parseBody(state)
  if (!body.ok) throw new Error(`expected a success envelope, got: ${state.body}`)
  return body.data
}

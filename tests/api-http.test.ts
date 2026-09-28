/**
 * Tests for the HTTP layer: method guard, rate limiting, body limits, schema
 * validation, and the guarantee that internal failures never leak to the browser.
 *
 * These exercise the real `defineRoute` and the real route handlers, with only
 * the Gemini call mocked, so the whole funnel is covered.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { aiUnavailable, notConfigured } from '../server/_lib/errors.ts'
import { __resetRateLimit } from '../server/_lib/rate-limit.ts'
import type { ApiRequest, ApiResponse } from '../server/_lib/contract.ts'

const createTasks = vi.hoisted(() => vi.fn())
vi.mock('../server/ai/actions.ts', () => ({
  createTasks,
  breakDownTask: vi.fn(),
  prioritize: vi.fn(),
  improveTask: vi.fn(),
}))

const { default: createHandler } = await import('../api/ai/create.ts')
const { default: healthHandler } = await import('../api/health.ts')

/** Minimal stand-in for the Node response object the handlers write to. */
function makeRes() {
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

function makeReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: 'POST',
    headers: {},
    body: { input: 'write the report', today: '2026-01-15', timezone: 'UTC' },
    ...overrides,
  }
}

const validBody = { input: 'write the report', today: '2026-01-15', timezone: 'UTC' }

beforeEach(() => {
  createTasks.mockReset()
  __resetRateLimit()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('method guard', () => {
  it('rejects anything but POST with 405 and an Allow header', async () => {
    const { res, state } = makeRes()
    await createHandler(makeReq({ method: 'GET' }), res)

    expect(state.status).toBe(405)
    expect(state.headers.get('allow')).toBe('POST')
    expect(JSON.parse(state.body).error.code).toBe('validation_error')
  })

  it('never calls the model for a rejected method', async () => {
    const { res } = makeRes()
    await createHandler(makeReq({ method: 'DELETE' }), res)
    expect(createTasks).not.toHaveBeenCalled()
  })
})

describe('successful request', () => {
  it('returns 200 with the validated data', async () => {
    const reply = { tasks: [], notes: null }
    createTasks.mockResolvedValue(reply)
    const { res, state } = makeRes()

    await createHandler(makeReq(), res)

    expect(state.status).toBe(200)
    expect(JSON.parse(state.body)).toEqual({ ok: true, data: reply })
    expect(state.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(state.headers.get('cache-control')).toBe('no-store')
    expect(state.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('passes only the validated fields to the action', async () => {
    createTasks.mockResolvedValue({ tasks: [], notes: null })
    const { res } = makeRes()

    await createHandler(
      makeReq({ body: { ...validBody, sneaky: 'ignored', extra: 1 } }),
      res,
    )

    expect(createTasks).toHaveBeenCalledWith(validBody)
  })
})

describe('request validation', () => {
  it('rejects a missing body with 400', async () => {
    const { res, state } = makeRes()
    await createHandler(makeReq({ body: undefined }), res)
    expect(state.status).toBe(400)
    expect(JSON.parse(state.body).ok).toBe(false)
  })

  it('rejects an invalid date with a readable message', async () => {
    const { res, state } = makeRes()
    await createHandler(makeReq({ body: { ...validBody, today: '2026-02-30' } }), res)

    const payload = JSON.parse(state.body)
    expect(state.status).toBe(400)
    expect(payload.error.code).toBe('validation_error')
    expect(payload.error.message).toMatch(/today/)
    expect(payload.error.retryable).toBe(false)
  })

  it('rejects malformed JSON with 400', async () => {
    const { res, state } = makeRes()
    await createHandler(makeReq({ body: '{not json' }), res)
    expect(state.status).toBe(400)
    expect(JSON.parse(state.body).error.message).toMatch(/valid JSON/i)
  })

  it('rejects an oversized body without reading it all', async () => {
    const { res, state } = makeRes()
    const huge = JSON.stringify({ ...validBody, input: 'x'.repeat(20_000) })
    await createHandler(makeReq({ body: huge }), res)
    expect(state.status).toBe(400)
    expect(JSON.parse(state.body).error.message).toMatch(/too large/i)
  })

  it('does not call the model for any invalid request', async () => {
    const { res } = makeRes()
    await createHandler(makeReq({ body: { input: '', today: TODAYISH, timezone: 'UTC' } }), res)
    expect(createTasks).not.toHaveBeenCalled()
  })
})

const TODAYISH = '2026-01-15'

describe('error translation', () => {
  it('maps a missing configuration to 503 and says what to do', async () => {
    createTasks.mockRejectedValue(
      notConfigured('The AI assistant is not configured yet. Add GEMINI_API_KEY to the environment to enable it.'),
    )
    const { res, state } = makeRes()
    await createHandler(makeReq(), res)

    expect(state.status).toBe(503)
    expect(JSON.parse(state.body).error.code).toBe('not_configured')
  })

  it('maps a provider failure to 502', async () => {
    createTasks.mockRejectedValue(aiUnavailable('The AI service is busy right now.'))
    const { res, state } = makeRes()
    await createHandler(makeReq(), res)

    expect(state.status).toBe(502)
    expect(JSON.parse(state.body).error.retryable).toBe(true)
  })

  it('does not leak an unexpected internal error to the browser', async () => {
    // A third-party SDK error can contain URLs, key fragments, or quota detail.
    createTasks.mockRejectedValue(
      new Error('GEMINI_API_KEY=AIza... quota exceeded for project internal-prod-4471'),
    )
    const { res, state } = makeRes()
    await createHandler(makeReq(), res)

    const payload = JSON.parse(state.body)
    expect(state.status).toBe(500)
    expect(payload.error.message).not.toMatch(/AIza|quota|internal-prod/)
    expect(payload.error.message).toBe('Something went wrong on our end. Please try again.')
    // …but it is still recorded server-side.
    expect(console.error).toHaveBeenCalled()
  })
})

describe('rate limiting', () => {
  it('allows a burst then returns 429 with a retry hint', async () => {
    createTasks.mockResolvedValue({ tasks: [], notes: null })

    for (let i = 0; i < 20; i += 1) {
      const { res, state } = makeRes()
      await createHandler(makeReq(), res)
      expect(state.status).toBe(200)
    }

    const { res, state } = makeRes()
    await createHandler(makeReq(), res)
    expect(state.status).toBe(429)

    const error = JSON.parse(state.body).error
    expect(error.code).toBe('rate_limited')
    expect(error.retryable).toBe(true)
    expect(error.message).toMatch(/Try again in \d+s/)
  })

  it('counts each client separately', async () => {
    createTasks.mockResolvedValue({ tasks: [], notes: null })
    for (let i = 0; i < 20; i += 1) {
      const { res } = makeRes()
      await createHandler(makeReq({ headers: { 'x-forwarded-for': '1.1.1.1' } }), res)
    }

    const { res, state } = makeRes()
    await createHandler(makeReq({ headers: { 'x-forwarded-for': '2.2.2.2' } }), res)
    expect(state.status).toBe(200)
  })
})

describe('health probe', () => {
  it('reports status without ever revealing the key', async () => {
    const { res, state } = makeRes()
    healthHandler({ method: 'GET', headers: {} }, res)

    const payload = JSON.parse(state.body)
    expect(state.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.data.status).toBe('healthy')
    expect(typeof payload.data.ai.configured).toBe('boolean')
    expect(typeof payload.data.ai.model).toBe('string')
    expect(state.body).not.toMatch(/AIza|API_KEY/)
  })

  it('allows GET and HEAD only', async () => {
    const { res, state } = makeRes()
    healthHandler({ method: 'POST', headers: {} }, res)
    expect(state.status).toBe(405)
  })
})

/**
 * Provider failure handling.
 *
 * This layer is only exercised when something outside the app is wrong: a
 * retired model id, a bad key, a quota, a timeout. None of that is reachable
 * from the happy-path tests, and all of it arrives as an opaque SDK error whose
 * shape we do not control.
 *
 * What is being pinned down is the translation: a raw `ApiError` must never
 * reach the browser, and the message a person sees must name the thing they can
 * actually fix. The 404 case is here because it is the one that shipped a
 * production outage with the message "check your connection", which pointed at
 * the network instead of at a model id Google had retired.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { budgetAllowsAnotherAttempt } from '../server/ai/client.ts'

const generateContent = vi.hoisted(() => vi.fn())

// Only the client is faked. `Type` and the rest come from the real module,
// because json-schema.ts reads the genuine enum to build response schemas.
vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    models = { generateContent }
  },
}))

const schema = z.object({ title: z.string() })

/** Loads a fresh client with the key present, so `getClient` proceeds. */
async function loadClient() {
  vi.resetModules()
  const { generateStructured } = await import('../server/ai/client.ts')
  return generateStructured
}

function request() {
  return {
    system: 'test',
    prompt: 'test',
    schema,
    schemaName: 'Test',
  }
}

/** Mirrors the shape `@google/genai` throws, which is what we must survive. */
function providerError(status: number, message: string) {
  return Object.assign(new Error(`ApiError: ${message}`), { status, code: status })
}

beforeEach(() => {
  generateContent.mockReset()
  // The model ladder is read at module load, so the environment has to start
  // from a known baseline every test. `restoreMocks` does not undo stubEnv, and
  // a leaked GEMINI_MODEL would silently collapse the ladder to one entry.
  vi.unstubAllEnvs()
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.stubEnv('GEMINI_MODEL', undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('provider failures become safe, actionable errors', () => {
  it('names the model id as the fix when Google says the model is gone', async () => {
    generateContent.mockRejectedValue(
      providerError(
        404,
        'This model models/gemini-2.5-flash is no longer available to new users. ' +
          'Please update your code to use models/gemini-3.8-flash',
      ),
    )
    const generateStructured = await loadClient()

    const error = await generateStructured(request()).catch((e: unknown) => e)

    expect(error).toMatchObject({ code: 'not_configured' })
    // The message must point at the fix, not at the network.
    expect((error as Error).message).toMatch(/GEMINI_MODEL/)
    expect((error as Error).message).not.toMatch(/connection/i)
  })

  it('marks a retired model as non-retryable, so the UI stops offering a retry', async () => {
    generateContent.mockRejectedValue(providerError(404, 'model is no longer available'))
    const generateStructured = await loadClient()

    const error = (await generateStructured(request()).catch((e: unknown) => e)) as {
      toJSON: () => { retryable: boolean }
    }

    expect(error.toJSON().retryable).toBe(false)
  })

  it('detects a retired model from the message even when the status is unhelpful', async () => {
    generateContent.mockRejectedValue(providerError(500, 'The model is no longer available'))
    const generateStructured = await loadClient()

    const error = await generateStructured(request()).catch((e: unknown) => e)

    expect((error as Error).message).toMatch(/GEMINI_MODEL/)
  })

  it('does not leak the raw provider error or the key into the message', async () => {
    generateContent.mockRejectedValue(
      providerError(400, 'API key not valid: AQ.testsecret, quota project internal-prod'),
    )
    const generateStructured = await loadClient()

    const error = (await generateStructured(request()).catch((e: unknown) => e)) as Error

    expect(error.message).not.toContain('AQ.testsecret')
    expect(error.message).not.toContain('internal-prod')
    expect(error.message).not.toContain('ApiError')
  })

  it('maps an invalid key to a message that says so', async () => {
    generateContent.mockRejectedValue(providerError(403, 'Permission denied'))
    const generateStructured = await loadClient()

    const error = (await generateStructured(request()).catch((e: unknown) => e)) as Error

    expect(error.message).toMatch(/API key/i)
  })

  it('treats a rate limit as retryable and a timeout as its own case', async () => {
    const generateStructured = await loadClient()

    generateContent.mockRejectedValue(providerError(429, 'Resource exhausted'))
    const rateLimited = (await generateStructured(request()).catch((e: unknown) => e)) as {
      toJSON: () => { retryable: boolean }
    }
    expect(rateLimited.toJSON().retryable).toBe(true)

    generateContent.mockRejectedValue(new Error('The request timed out'))
    const timedOut = (await generateStructured(request()).catch((e: unknown) => e)) as Error
    expect(timedOut.message).toMatch(/too long/i)
  })

  it('defaults to the model id verified against the provider, and honours an override', async () => {
    vi.resetModules()
    const { aiConfiguration } = await import('../server/ai/client.ts')
    // Pinned deliberately: when Google retires this id, this test is what
    // should fail first, pointing at the one line that needs changing.
    expect(aiConfiguration().model).toBe('gemini-3.6-flash')

    vi.stubEnv('GEMINI_MODEL', 'gemini-something-else')
    vi.resetModules()
    const overridden = await import('../server/ai/client.ts')
    expect(overridden.aiConfiguration().model).toBe('gemini-something-else')
  })
})

describe('the model ladder', () => {
  it('falls through to the next model when one is at capacity', async () => {
    generateContent
      .mockRejectedValueOnce(providerError(503, 'This model is currently experiencing high demand'))
      .mockResolvedValueOnce({ text: JSON.stringify({ title: 'Draft the report' }) })
    const generateStructured = await loadClient()

    const result = await generateStructured(request())

    expect(result).toEqual({ title: 'Draft the report' })
    expect(generateContent).toHaveBeenCalledTimes(2)
    const models = generateContent.mock.calls.map((c) => (c[0] as { model: string }).model)
    expect(models[0]).not.toBe(models[1])
  })

  it('falls through when a rung returns a 504, since a deadline is load too', async () => {
    // 504 is a loaded backend timing out. Treating it as fatal made one
    // saturated rung end the request while the rest of the ladder was healthy.
    generateContent
      .mockRejectedValueOnce(providerError(504, 'Deadline exceeded before operation could complete.'))
      .mockResolvedValueOnce({ text: JSON.stringify({ title: 'Draft the report' }) })
    const generateStructured = await loadClient()

    const result = await generateStructured(request())

    expect(result).toEqual({ title: 'Draft the report' })
    expect(generateContent).toHaveBeenCalledTimes(2)
  })

  it('falls through on a 504 reported without a status code', async () => {
    // The status is not always on the error object, so the text has to be
    // enough on its own.
    generateContent
      .mockRejectedValueOnce(new Error('{"error":{"status":"DEADLINE_EXCEEDED"}}'))
      .mockResolvedValueOnce({ text: JSON.stringify({ title: 'ok' }) })
    const generateStructured = await loadClient()

    expect(await generateStructured(request())).toEqual({ title: 'ok' })
  })

  it('blames the service, not the connection, when the ladder ends in a 504', async () => {
    generateContent.mockRejectedValue(providerError(504, 'Deadline exceeded'))
    const generateStructured = await loadClient()

    const error = (await generateStructured(request()).catch((e: unknown) => e)) as Error

    expect(error.message).toMatch(/temporarily unavailable/i)
    expect(error.message).not.toMatch(/check your connection/i)
  })

  it('stops walking the ladder when the time budget is spent', async () => {
    // The regression this exists for: five rungs at two SDK retries each could
    // spend 200s against a 30s function limit, and Vercel answers that with
    // FUNCTION_INVOCATION_TIMEOUT — a bare 500 that says nothing about the
    // cause. The walk has to end in time to return a real error.
    let clock = 0
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock)
    generateContent.mockImplementation(async () => {
      clock += 9_000
      throw providerError(503, 'high demand')
    })
    const generateStructured = await loadClient()

    const error = (await generateStructured(request()).catch((e: unknown) => e)) as {
      code: string
      toJSON: () => { retryable: boolean }
    }

    expect(generateContent.mock.calls.length).toBeLessThan(5)
    expect(error.code).toBe('ai_unavailable')
    expect(error.toJSON().retryable).toBe(true)
    now.mockRestore()
  })

  it('spends what is left of the budget on a second model before giving up', async () => {
    // The guard is time, not an attempt cap. One 12s failure still leaves enough
    // budget for exactly one more try, and that try is worth making.
    let clock = 0
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock)
    generateContent.mockImplementation(async () => {
      clock += 12_000
      throw providerError(503, 'high demand')
    })
    const generateStructured = await loadClient()

    await generateStructured(request()).catch(() => undefined)

    expect(generateContent).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })

  it('budgets against a ceiling that fits inside the function limit', () => {
    // Guards the arithmetic, so changing a constant cannot quietly reintroduce
    // the timeout. 30s in vercel.json, 26s of budget, 12s per attempt.
    expect(budgetAllowsAnotherAttempt(0)).toBe(true)
    expect(budgetAllowsAnotherAttempt(13_000)).toBe(true)
    expect(budgetAllowsAnotherAttempt(14_000)).toBe(true)
    expect(budgetAllowsAnotherAttempt(15_000)).toBe(false)
    expect(budgetAllowsAnotherAttempt(60_000)).toBe(false)
  })

  it('keeps walking the ladder on a client-side timeout, bounded by the budget', async () => {
    // Our own attempt deadline firing means this model is slow, not that the
    // request is malformed, so the next rung is worth a try. What stops the
    // walk is the budget above, not the first abort.
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
      .mockResolvedValueOnce({ text: JSON.stringify({ title: 'ok' }) })
    const generateStructured = await loadClient()

    expect(await generateStructured(request())).toEqual({ title: 'ok' })
  })

  it('does not retry the same model across the ladder', async () => {
    generateContent.mockRejectedValue(providerError(503, 'high demand'))
    const generateStructured = await loadClient()

    await generateStructured(request()).catch(() => undefined)

    const models = generateContent.mock.calls.map((c) => (c[0] as { model: string }).model)
    expect(new Set(models).size).toBe(models.length)
  })

  it('stops at the first model that answers, without calling the rest', async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ title: 'ok' }) })
    const generateStructured = await loadClient()

    await generateStructured(request())

    expect(generateContent).toHaveBeenCalledTimes(1)
  })

  it('does not fall through on a bad key, because no model will fix it', async () => {
    generateContent.mockRejectedValue(providerError(403, 'Permission denied'))
    const generateStructured = await loadClient()

    const error = (await generateStructured(request()).catch((e: unknown) => e)) as Error

    expect(generateContent).toHaveBeenCalledTimes(1)
    expect(error.message).toMatch(/API key/i)
  })

  it('reports a temporary outage once the whole ladder is exhausted', async () => {
    generateContent.mockRejectedValue(providerError(503, 'high demand'))
    const generateStructured = await loadClient()

    const error = (await generateStructured(request()).catch((e: unknown) => e)) as {
      code: string
      toJSON: () => { retryable: boolean }
    }

    expect(error.code).toBe('ai_unavailable')
    expect(error.toJSON().retryable).toBe(true)
  })

  it('honours an explicit GEMINI_MODEL without silently substituting another', async () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-pinned-by-operator')
    generateContent.mockRejectedValue(providerError(503, 'high demand'))
    const generateStructured = await loadClient()

    await generateStructured(request()).catch(() => undefined)

    const models = generateContent.mock.calls.map((c) => (c[0] as { model: string }).model)
    expect(models).toEqual(['gemini-pinned-by-operator'])
  })

  it('sends the same response schema to every model it tries', async () => {
    generateContent
      .mockRejectedValueOnce(providerError(503, 'high demand'))
      .mockResolvedValueOnce({ text: JSON.stringify({ title: 'ok' }) })
    const generateStructured = await loadClient()

    await generateStructured(request())

    const configs = generateContent.mock.calls.map(
      (c) => (c[0] as { config: { responseSchema: unknown } }).config.responseSchema,
    )
    expect(configs[0]).toEqual(configs[1])
  })
})

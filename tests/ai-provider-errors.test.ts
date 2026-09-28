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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

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
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(aiConfiguration().model).toBe('gemini-3.8-flash')

    vi.stubEnv('GEMINI_MODEL', 'gemini-something-else')
    vi.resetModules()
    const overridden = await import('../server/ai/client.ts')
    expect(overridden.aiConfiguration().model).toBe('gemini-something-else')
  })
})

/**
 * The single place the Gemini API is contacted.
 *
 * Responsibilities, in order of importance:
 *   1. Keep the API key on the server. It is read from the environment here and
 *      never crosses into the client bundle.
 *   2. Ask for structured output using a schema derived from our own Zod
 *      contract, so the model cannot answer "in prose".
 *   3. Treat the reply as hostile input: parse JSON, validate against Zod, and
 *      discard anything that does not conform.
 *   4. Translate every provider failure into a user-safe message.
 */

import { GoogleGenAI } from '@google/genai'
import type { z } from 'zod'

import { aiUnavailable, invalidAiResponse, notConfigured } from '../_lib/errors.ts'
import { toGeminiSchema } from './json-schema.ts'

/** Read once per cold start. Either provider env var is accepted. */
const API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? ''

/**
 * Models to try, in order.
 *
 * A single model id is not a stable default. Google both retires models and
 * intermittently returns 503 "high demand" for ids that are perfectly current.
 * The list is long for that reason: on 2026-09-29, 3.6-flash, 3.8-flash,
 * 3.7-flash and flash-latest were *all* serving 503 at the same time, so a
 * three-rung ladder made the app look broken while models that answered in one
 * request sat unused two entries down. Each request walks this list and falls
 * through on capacity errors only. Every entry accepts the same response
 * schema, so falling through is invisible to the user.
 *
 * Ordering is a preference, not a rule: newest first, the moving `-latest`
 * alias next, and an older lite model last as the option most likely to be
 * serving when everything newer is saturated.
 *
 * An explicit `GEMINI_MODEL` is honoured on its own and never silently
 * substituted: if an operator pins a model, they want that model or an error,
 * not a different one they never approved.
 */
const MODELS: readonly string[] = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : [
      'gemini-3.6-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ]

/** The model reported by /api/health: the one most requests will use. */
const MODEL = MODELS[0] as string

/** Serverless functions get killed on long requests; fail fast and cleanly. */
const REQUEST_TIMEOUT_MS = 20_000

let client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (client) return client
  if (!API_KEY) {
    throw notConfigured(
      'The AI assistant is not configured yet. Add GEMINI_API_KEY to the environment to enable it.',
    )
  }
  client = new GoogleGenAI({
    apiKey: API_KEY,
    httpOptions: { timeout: REQUEST_TIMEOUT_MS, retryOptions: { attempts: 2 } },
  })
  return client
}

export interface StructuredRequest<S extends z.ZodType> {
  /** Instructions that hold across the whole exchange. */
  system: string
  /** The user turn. */
  prompt: string
  /** Zod schema for the expected reply. Drives both the prompt contract and validation. */
  schema: S
  /** Object title reported to the model; helps it stay on topic. */
  schemaName: string
  temperature?: number
}

/**
 * Calls Gemini and returns a value that has passed `schema`.
 *
 * Walks the model ladder, falling through on capacity errors only. A bad key or
 * a malformed request will fail identically on every model, so retrying those
 * would just multiply the latency before returning the same answer.
 *
 * Throws `AppError` subclasses only, so callers never have to reason about SDK
 * error shapes.
 */
export async function generateStructured<S extends z.ZodType>(
  request: StructuredRequest<S>,
): Promise<z.output<S>> {
  const ai = getClient()
  const responseSchema = toGeminiSchema(request.schema, request.schemaName)

  let text: string | undefined
  let lastError: unknown

  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: request.prompt,
        config: {
          systemInstruction: request.system,
          temperature: request.temperature ?? 0.3,
          responseMimeType: 'application/json',
          responseSchema,
          // Keep latency predictable: this is a UI interaction, not a reasoning task.
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
      text = response.text
      break
    } catch (error) {
      if (!isCapacityError(error)) throw translateProviderError(error)
      lastError = error
      console.warn(`[ai] ${model} is at capacity, trying the next model`)
    }
  }

  if (text === undefined) throw translateProviderError(lastError)

  if (!text || text.trim().length === 0) {
    // A blocked or empty completion still returns a 200, so it needs its own message.
    throw aiUnavailable('The AI returned an empty response. Try rephrasing your request.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw invalidAiResponse('The AI returned a response we could not read. Please try again.')
  }

  const validated = request.schema.safeParse(parsed)
  if (!validated.success) {
    console.error('[ai] response failed validation', validated.error.issues)
    throw invalidAiResponse('The AI returned an unexpected response shape. Please try again.')
  }

  return validated.data
}

/**
 * Maps a Gemini SDK failure onto a safe `AppError`.
 *
 * Only messages written here ever reach the browser — the raw error is logged
 * server-side, because SDK errors can embed request URLs and quota internals.
 */
function translateProviderError(error: unknown): ReturnType<typeof aiUnavailable> {
  console.error('[ai] provider error', error)
  const text = error instanceof Error ? error.message : String(error)
  const status = extractStatus(error)

  // A 404 from this SDK means the model id is gone, not that the network is
  // down. Google retires models on a schedule and the response says so, but a
  // generic "check your connection" sends whoever is debugging it in exactly
  // the wrong direction — which is what happened the first time this fired.
  if (status === 404 || /no longer available|is not found for API version/i.test(text)) {
    return notConfigured(
      'The configured AI model is no longer available. Set GEMINI_MODEL to a current model id and redeploy.',
    )
  }
  if (status === 400 || status === 401 || status === 403) {
    return aiUnavailable(
      'The AI service rejected the request. Check that the API key is valid and the model is available.',
    )
  }
  if (status === 429) {
    return aiUnavailable('The AI service is busy right now. Please try again in a moment.')
  }
  if (status === 500 || status === 503 || status === 504) {
    return aiUnavailable('The AI service is temporarily unavailable. Please try again.')
  }  if (/abort|timeout|timed out/i.test(text)) {
    return aiUnavailable('The AI took too long to respond. Please try again.')
  }
  return aiUnavailable('We could not reach the AI service. Check your connection and try again.')
}

/**
 * Whether a failure is worth trying a different model for.
 *
 * Deliberately narrow: capacity and overload only. Anything else — a bad key, a
 * schema the model refuses, a safety block — is a property of the request, not
 * of the model, and will recur on every entry in the ladder.
 *
 * 504 and `DEADLINE_EXCEEDED` belong here. A gateway deadline is a loaded
 * backend timing out, which is the same condition as a 503 wearing a different
 * code, and it was treated as fatal: one saturated rung returned 504, the
 * ladder gave up, and the response was "check your connection" when every
 * later rung was healthy.
 *
 * The client's own `REQUEST_TIMEOUT_MS` is deliberately still terminal. That
 * abort is a property of how long *we* are prepared to wait, not of which model
 * is busy, so retrying the rest of the ladder would multiply the wait before
 * returning the same answer.
 */
function isCapacityError(error: unknown): boolean {
  const status = extractStatus(error)
  if (status === 429 || status === 500 || status === 503 || status === 504) return true
  const text = error instanceof Error ? error.message : String(error)
  return /high demand|overloaded|UNAVAILABLE|rate limit|DEADLINE_EXCEEDED|deadline exceeded/i.test(text)
}

/** Digs an HTTP status out of the SDK error without depending on its internals. */
function extractStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { status?: unknown; code?: unknown }
  for (const value of [candidate.status, candidate.code]) {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  }
  return undefined
}

/** Exposed for the health/logging path; never returns the key itself. */
export function aiConfiguration(): { model: string; configured: boolean } {
  return { model: MODEL, configured: API_KEY.length > 0 }
}

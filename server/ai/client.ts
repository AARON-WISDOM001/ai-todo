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

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

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
 * Throws `AppError` subclasses only, so callers never have to reason about SDK
 * error shapes.
 */
export async function generateStructured<S extends z.ZodType>(
  request: StructuredRequest<S>,
): Promise<z.output<S>> {
  const ai = getClient()

  let text: string | undefined
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: request.prompt,
      config: {
        systemInstruction: request.system,
        temperature: request.temperature ?? 0.3,
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(request.schema, request.schemaName),
        // Keep latency predictable: this is a UI interaction, not a reasoning task.
        thinkingConfig: { thinkingBudget: 0 },
      },
    })
    text = response.text
  } catch (error) {
    throw translateProviderError(error)
  }

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

  if (status === 400 || status === 401 || status === 403) {
    return aiUnavailable(
      'The AI service rejected the request. Check that the API key is valid and the model is available.',
    )
  }
  if (status === 429) {
    return aiUnavailable('The AI service is busy right now. Please try again in a moment.')
  }
  if (status === 500 || status === 503) {
    return aiUnavailable('The AI service is temporarily unavailable. Please try again.')
  }
  if (/abort|timeout|timed out/i.test(text)) {
    return aiUnavailable('The AI took too long to respond. Please try again.')
  }
  return aiUnavailable('We could not reach the AI service. Check your connection and try again.')
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

/**
 * A single error type for everything the API can fail with.
 *
 * The rule this file enforces: internal failures are logged in full on the
 * server and reduced to a human-readable sentence on the wire. Stack traces,
 * provider SDK messages, and environment details never cross the boundary.
 */

import type { AiError, AiErrorCode } from '../../shared/ai.ts'

const STATUS_BY_CODE: Record<AiErrorCode, number> = {
  validation_error: 400,
  not_configured: 503,
  ai_unavailable: 502,
  invalid_ai_response: 502,
  rate_limited: 429,
  internal_error: 500,
}

const RETRYABLE_BY_CODE: Record<AiErrorCode, boolean> = {
  validation_error: false,
  not_configured: false,
  ai_unavailable: true,
  invalid_ai_response: true,
  rate_limited: true,
  internal_error: true,
}

export class AppError extends Error {
  readonly code: AiErrorCode

  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }

  get status(): number {
    return STATUS_BY_CODE[this.code]
  }

  toJSON(): AiError {
    return {
      code: this.code,
      message: this.message,
      retryable: RETRYABLE_BY_CODE[this.code],
    }
  }
}

export const badRequest = (message: string) => new AppError('validation_error', message)
export const notConfigured = (message: string) => new AppError('not_configured', message)
export const aiUnavailable = (message: string) => new AppError('ai_unavailable', message)
export const invalidAiResponse = (message: string) => new AppError('invalid_ai_response', message)
export const rateLimited = (message: string) => new AppError('rate_limited', message)
export const internalError = (message: string) => new AppError('internal_error', message)

/**
 * Last-resort mapping for anything thrown that is not an `AppError`.
 *
 * Third-party SDK errors land here. Their text can contain request URLs, key
 * fragments, or quota internals, so the user only ever sees a generic message
 * while the original is logged server-side.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  return new AppError('internal_error', 'Something went wrong on our end. Please try again.')
}

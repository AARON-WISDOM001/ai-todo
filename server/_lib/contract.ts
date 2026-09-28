/**
 * The serverless handler contract.
 *
 * These are structural types rather than an import from `@vercel/node`. That
 * package is types-only for us yet pulls in a large transitive dependency tree
 * (undici, ajv, path-to-regexp) that shows up as high-severity advisories on
 * every `npm audit`. Declaring the handful of fields we actually use keeps the
 * dependency surface — and the audit — clean, and keeps the handlers portable
 * across Vercel and the local dev middleware.
 */

export interface ApiRequest {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  /** Present on Vercel; used only for coarse rate limiting. */
  socket?: { remoteAddress?: string }
}

export interface ApiResponse {
  statusCode: number
  setHeader(name: string, value: string): void
  end(chunk?: string): void
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => void | Promise<void>

/** Reads a header regardless of whether the runtime lowercased it or joined it. */
export function header(req: ApiRequest, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() !== lower) continue
    return Array.isArray(value) ? value[0] : value
  }
  return undefined
}

/** Best-effort client identity for rate limiting. */
export function clientKey(req: ApiRequest): string {
  const forwarded = header(req, 'x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return header(req, 'x-real-ip') ?? req.socket?.remoteAddress ?? 'anonymous'
}

/**
 * A small in-process rate limiter for the AI endpoints.
 *
 * Each AI call costs real money, so the endpoint needs *some* protection. A
 * serverless function cannot rely on a long-lived process or a shared store, so
 * this is deliberately a per-instance fixed window: it reliably caps a runaway
 * loop or a script hammering one instance, and is a best-effort guard rather
 * than a hard guarantee. Production-grade abuse prevention belongs at the edge
 * (Vercel WAF / firewall rules), which is noted in the README.
 */

import type { ApiRequest } from './contract.ts'
import { clientKey } from './contract.ts'
import { rateLimited } from './errors.ts'

const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 20

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

/** Drops expired windows so the map cannot grow without bound. */
function sweep(now: number): void {
  if (windows.size < 500) return
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export function enforceRateLimit(req: ApiRequest): void {
  const now = Date.now()
  sweep(now)

  const key = clientKey(req)
  const current = windows.get(key)

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    const seconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    throw rateLimited(`Too many AI requests. Try again in ${seconds}s.`)
  }

  current.count += 1
}

/** Test-only hook so the limiter can be exercised without a real clock. */
export function __resetRateLimit(): void {
  windows.clear()
}

/**
 * GET /api/health — deployment and configuration probe.
 *
 * Reports only whether the AI key is *present*, never any part of its value, so
 * it is safe to call from a browser and safe to leave unauthenticated.
 */

import { aiConfiguration } from '../server/ai/client.ts'
import { sendJson } from '../server/_lib/http.ts'
import type { ApiRequest, ApiResponse } from '../server/_lib/contract.ts'

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    sendJson(res, 405, { ok: false, error: { code: 'validation_error', message: 'Use GET.', retryable: false } })
    return
  }

  const { model, configured } = aiConfiguration()
  sendJson(res, 200, { ok: true, data: { status: 'healthy', ai: { configured, model } } })
}

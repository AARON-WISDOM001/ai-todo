/**
 * POST /api/ai/prioritize — recommends what to work on next.
 * Purely read-only; the client's task list is sent in and nothing is written.
 */

import { prioritizeRequestSchema } from '../../../shared/ai.ts'
import { prioritize } from '../../ai/actions.ts'
import { defineRoute } from '../../_lib/http.ts'

export default defineRoute(prioritizeRequestSchema, async (request) => ({
  ok: true,
  data: await prioritize(request),
}))

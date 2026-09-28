/**
 * POST /api/ai/breakdown — expands one task into ordered, actionable steps.
 * Read-only: the parent task is never modified.
 */

import { breakdownRequestSchema } from '../../shared/ai.ts'
import { breakDownTask } from '../../server/ai/actions.ts'
import { defineRoute } from '../../server/_lib/http.ts'

export default defineRoute(breakdownRequestSchema, async (request) => ({
  ok: true,
  data: await breakDownTask(request),
}))

/**
 * POST /api/ai/improve — rewrites a task to be clearer and more actionable.
 * Returns a before/after proposal; the user chooses whether to apply it.
 */

import { improveRequestSchema } from '../../shared/ai.ts'
import { improveTask } from '../../server/ai/actions.ts'
import { defineRoute } from '../../server/_lib/http.ts'

export default defineRoute(improveRequestSchema, async (request) => ({
  ok: true,
  data: await improveTask(request),
}))

/**
 * POST /api/ai/create — natural-language task creation.
 * Returns task *proposals*; nothing is saved until the user confirms in the UI.
 */

import { createTasksRequestSchema } from '../../../shared/ai.ts'
import { createTasks } from '../../ai/actions.ts'
import { defineRoute } from '../../_lib/http.ts'

export default defineRoute(createTasksRequestSchema, async (request) => ({
  ok: true,
  data: await createTasks(request),
}))

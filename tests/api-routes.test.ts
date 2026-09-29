/**
 * Every AI endpoint, tested as an endpoint.
 *
 * `ai-actions.test.ts` proves each action does the right thing with a model
 * reply. It does not prove the route is wired to that action, that the right
 * request schema guards it, or that a failure comes back in a safe envelope.
 * Those are separate defects and they shipped separately: three of these four
 * routes had never been exercised at the HTTP layer at all, and a suite of 195
 * green tests said nothing about it.
 *
 * So the routes are described once, in a table, and every row is driven through
 * the same four behaviours. Adding a capability means adding a row here, which
 * is the point — a missing endpoint should be a missing line, not a silent gap.
 *
 * `health` is not in this table. It is not a `defineRoute` handler: it accepts
 * GET and HEAD rather than POST, and it has no request schema. It is tested in
 * `api-http.test.ts` alongside the rate limiter, which is where it belongs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiRequest, ApiResponse } from '../server/_lib/contract.ts'

import { aiUnavailable, notConfigured } from '../server/_lib/errors.ts'
import { __resetRateLimit } from '../server/_lib/rate-limit.ts'
import { makeReq, makeRes, parseBody, expectError, DATE_CONTEXT } from './helpers/api.ts'
import { makeTask } from './fixtures/tasks.ts'

const createTasks = vi.hoisted(() => vi.fn())
const breakDownTask = vi.hoisted(() => vi.fn())
const prioritize = vi.hoisted(() => vi.fn())
const improveTask = vi.hoisted(() => vi.fn())

// Only the actions are faked. The real `defineRoute` and the real schemas run,
// because those are precisely the layers this file is about.
vi.mock('../server/ai/actions.ts', () => ({
  createTasks,
  breakDownTask,
  prioritize,
  improveTask,
}))

type Action = 'createTasks' | 'breakDownTask' | 'prioritize' | 'improveTask'
type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void>

interface RouteCase {
  /** Path under `server/routes`, for the failure message. */
  name: string
  load: () => Promise<{ default: Handler }>
  action: Action
  /** A body the request schema accepts. */
  valid: Record<string, unknown>
  /** A body the action returns, which the route must pass through untouched. */
  reply: unknown
  /** A field name that must be named in the 400 when it is wrong. */
  invalidField: string
}

/** What a valid task looks like to `prioritize`, derived from the real fixture. */
function taskContext(id: string, overrides: Parameters<typeof makeTask>[0] = {}) {
  const task = makeTask({ id, ...overrides })
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    completed: task.completed,
    remainingSubtasks: task.subtasks.length,
  }
}

const ROUTES: RouteCase[] = [
  {
    name: 'ai/create',
    load: () => import('../server/routes/ai/create.ts'),
    action: 'createTasks',
    valid: { input: 'write the report', ...DATE_CONTEXT },
    reply: { tasks: [{ title: 'Submit report', description: '', priority: 'high', dueDate: '2026-01-16', rationale: null }], notes: null },
    invalidField: 'input',
  },
  {
    name: 'ai/breakdown',
    load: () => import('../server/routes/ai/breakdown.ts'),
    action: 'breakDownTask',
    valid: { taskId: 'task-1', title: 'Write the report', description: 'Include the results.', ...DATE_CONTEXT },
    reply: { steps: [{ title: 'Collect the data', rationale: null }], notes: null },
    invalidField: 'taskId',
  },
  {
    name: 'ai/prioritize',
    load: () => import('../server/routes/ai/prioritize.ts'),
    action: 'prioritize',
    valid: { tasks: [taskContext('task-1', { priority: 'high' })], ...DATE_CONTEXT },
    reply: { focusTaskId: 'task-1', headline: 'Start the report.', reasoning: 'It is high priority.', suggestedOrder: ['task-1'] },
    invalidField: 'tasks',
  },
  {
    name: 'ai/improve',
    load: () => import('../server/routes/ai/improve.ts'),
    action: 'improveTask',
    valid: { title: 'do the report thing', description: 'results', ...DATE_CONTEXT },
    reply: { title: 'Submit the internship report', description: 'Include the results section.', rationale: null },
    invalidField: 'title',
  },
]

const actions: Record<Action, ReturnType<typeof vi.fn>> = {
  createTasks,
  breakDownTask,
  prioritize,
  improveTask,
}

function resetAll() {
  createTasks.mockReset()
  breakDownTask.mockReset()
  prioritize.mockReset()
  improveTask.mockReset()
  __resetRateLimit()
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

beforeEach(() => {
  resetAll()
})

describe.each(ROUTES)('POST /api/$name', (route) => {
  it('answers 200 with the action result, unchanged', async () => {
    actions[route.action].mockResolvedValue(route.reply)
    const { default: handler } = await route.load()
    const { res, state } = makeRes()

    await handler(makeReq({ body: route.valid }), res)

    expect(state.status).toBe(200)
    expect(parseBody(state)).toEqual({ ok: true, data: route.reply })
    expect(state.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(state.headers.get('cache-control')).toBe('no-store')
    expect(state.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('rejects anything but POST with 405 and an Allow header', async () => {
    const { default: handler } = await route.load()
    const { res, state } = makeRes()

    await handler(makeReq({ method: 'GET', body: route.valid }), res)

    expect(state.status).toBe(405)
    expect(state.headers.get('allow')).toBe('POST')
    expect(expectError(state).code).toBe('validation_error')
  })

  it('never calls the action for a request the schema rejects', async () => {
    const { default: handler } = await route.load()
    const { res, state } = makeRes()

    // An impossible date: `2026-02-30` is the case a regex alone would accept,
    // and it is the one every route shares through `dateContextSchema`.
    await handler(makeReq({ body: { ...route.valid, today: '2026-02-30' } }), res)

    expect(state.status).toBe(400)
    expect(actions[route.action]).not.toHaveBeenCalled()
  })

  it('names the offending field when the request is invalid', async () => {
    const { default: handler } = await route.load()
    const { res, state } = makeRes()
    const bad = { ...route.valid, [route.invalidField]: '' }

    await handler(makeReq({ body: bad }), res)

    expect(state.status).toBe(400)
    expect(expectError(state).message).toContain(route.invalidField)
    expect(expectError(state).retryable).toBe(false)
  })

  it('passes only the validated fields to the action', async () => {
    actions[route.action].mockResolvedValue(route.reply)
    const { default: handler } = await route.load()
    const { res } = makeRes()

    await handler(makeReq({ body: { ...route.valid, sneaky: 'ignored', extra: 1 } }), res)

    // The extra keys are stripped by the schema, so the action cannot be
    // reached with anything the contract did not declare.
    expect(actions[route.action]).toHaveBeenCalledWith(route.valid)
  })

  it('maps a missing configuration to 503 and says what to do', async () => {
    actions[route.action].mockRejectedValue(
      notConfigured('The AI assistant is not configured yet. Add GEMINI_API_KEY to the environment to enable it.'),
    )
    const { default: handler } = await route.load()
    const { res, state } = makeRes()

    await handler(makeReq({ body: route.valid }), res)

    expect(state.status).toBe(503)
    expect(expectError(state).code).toBe('not_configured')
  })

  it('maps a provider failure to a retryable 502', async () => {
    actions[route.action].mockRejectedValue(aiUnavailable('The AI service is busy right now.'))
    const { default: handler } = await route.load()
    const { res, state } = makeRes()

    await handler(makeReq({ body: route.valid }), res)

    expect(state.status).toBe(502)
    expect(expectError(state).retryable).toBe(true)
  })

  it('does not leak an unexpected internal error to the browser', async () => {
    // A third-party SDK error can contain URLs, key fragments, or quota detail.
    actions[route.action].mockRejectedValue(
      new Error('GEMINI_API_KEY=AIza... quota exceeded for project internal-prod-4471'),
    )
    const { default: handler } = await route.load()
    const { res, state } = makeRes()

    await handler(makeReq({ body: route.valid }), res)

    expect(state.status).toBe(500)
    expect(expectError(state).message).not.toMatch(/AIza|quota|internal-prod|API_KEY/)
    expect(expectError(state).message).toBe('Something went wrong on our end. Please try again.')
    // …but it is still recorded server-side.
    expect(console.error).toHaveBeenCalled()
  })
})

describe('every route under server/routes is covered here or in api-http.test.ts', () => {
  it('has no endpoint that was never given an HTTP test', async () => {
    // The meta-test. The gap this file exists to close happened because nothing
    // compared the set of routes against the set of tested routes — three
    // endpoints could go from written to deployed without a test existing and
    // the suite would stay green. So the comparison is now the test.
    const { readdir } = await import('node:fs/promises')
    const { join } = await import('node:path')

    // `process.cwd()` rather than `import.meta.url`: under the jsdom
    // environment this file runs in, the latter is not a file URL.
    const root = process.cwd()

    async function routesIn(dir: string): Promise<string[]> {
      const entries = await readdir(join(root, 'server', 'routes', dir), { withFileTypes: true })
      return entries.filter((e) => e.isFile() && e.name.endsWith('.ts')).map((e) => `${dir}/${e.name.replace(/\.ts$/, '')}`)
    }

    const aiRoutes = await routesIn('ai')
    const allRoutes = ['health', ...aiRoutes]
    const testedHere = ROUTES.map((r) => r.name)
    // `health` is covered in api-http.test.ts; it is the only exemption, and it
    // is named explicitly so adding a second one becomes a deliberate edit.
    const testedElsewhere = ['health']

    expect(aiRoutes).toHaveLength(ROUTES.length)
    expect([...testedHere, ...testedElsewhere].sort()).toEqual(allRoutes.sort())
  })
})

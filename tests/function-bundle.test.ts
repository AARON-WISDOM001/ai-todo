/**
 * The deployment test.
 *
 * Vercel builds a function by transpiling one entry file in place. It does not
 * follow relative imports into sibling TypeScript, so with `"type": "module"`
 * the specifier `../../shared/ai.ts` survives into the emitted JavaScript and
 * Node throws ERR_MODULE_NOT_FOUND on the first request. The build reports
 * success, the static app works, and every API call fails with
 * FUNCTION_INVOCATION_FAILED — which is exactly how this reached production the
 * first time.
 *
 * Unit tests over the route sources cannot catch that, because the sources
 * resolve perfectly well under Vite. So this bundles each route the way the
 * build does, then runs the output in a separate Node process the way Vercel
 * does. It is the only test in the suite that exercises the artefact we
 * actually deploy.
 *
 * Every route is covered, not just one. A single-route version of this test
 * would have passed happily while the three untested AI routes were still
 * unproven, which is the same silent gap in a different place.
 */

// esbuild refuses to run under jsdom: its `instanceof Uint8Array` invariant
// does not hold across the realm boundary, and the test asserts on emitted
// text rather than on rendered markup, so it needs no DOM.
// @vitest-environment node

import { execFile } from 'node:child_process'
import { readFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'node_modules', '.tmp', 'function-bundle-test')

interface RouteSpec {
  /** Path under `server/routes`, without the extension. */
  entry: string
  /** The request the bundled function is invoked with. */
  request: { method: string; headers: Record<string, string>; body?: unknown }
  /** Status the bundled function must answer with. */
  expectStatus: number
}

const DATE_CONTEXT = { today: '2026-01-15', timezone: 'UTC' }

const ROUTES: RouteSpec[] = [
  { entry: 'health', request: { method: 'GET', headers: {} }, expectStatus: 200 },
  {
    entry: 'ai/create',
    request: { method: 'POST', headers: {}, body: { input: 'write the report', ...DATE_CONTEXT } },
    expectStatus: 503,
  },
  {
    entry: 'ai/breakdown',
    request: { method: 'POST', headers: {}, body: { taskId: 'task-1', title: 'Write the report', ...DATE_CONTEXT } },
    expectStatus: 503,
  },
  {
    entry: 'ai/prioritize',
    request: {
      method: 'POST',
      headers: {},
      body: {
        tasks: [{ id: 'task-1', title: 'Write it', priority: 'high', dueDate: null, completed: false, remainingSubtasks: 0 }],
        ...DATE_CONTEXT,
      },
    },
    expectStatus: 503,
  },
  {
    entry: 'ai/improve',
    request: { method: 'POST', headers: {}, body: { title: 'do the thing', ...DATE_CONTEXT } },
    expectStatus: 503,
  },
]

/**
 * The AI routes are expected to answer 503, not 200.
 *
 * There is no key in this process, so the action layer raises
 * `notConfigured`, which `server/_lib/errors.ts` maps to 503. The point is that
 * the bundled function is *loadable and runnable*: a status from the app's own
 * error table proves the request travelled the whole stack — routing, method
 * guard, schema validation, error envelope — and that no import resolution
 * failed on the way. A 200 would require a live Gemini call, which would make
 * this a network test rather than a deployment test, and a bare 500 would mean
 * an import broke and the envelope was never reached.
 */
const emitted = new Map<string, string>()

beforeAll(async () => {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  for (const route of ROUTES) {
    const outfile = join(outDir, `${route.entry.replace(/\//g, '-')}.mjs`)
    await build({
      entryPoints: [join(root, 'server', 'routes', `${route.entry}.ts`)],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      external: ['@google/genai'],
      logLevel: 'silent',
    })
    emitted.set(route.entry, await readFile(outfile, 'utf8'))
  }
}, 120_000)

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

describe('deployed function bundle', () => {
  it.each(ROUTES)('leaves no relative TypeScript import in $entry', (route) => {
    // The exact failure: a specifier that survives bundling and points at a
    // file that only exists in the source tree.
    const text = emitted.get(route.entry) ?? ''
    expect(text).not.toMatch(/from\s*["'][^"']*\.ts["']/)
    expect(text).not.toMatch(/import\s*\(\s*["'][^"']*\.ts["']\s*\)/)
  })

  it('still imports the Gemini SDK from node_modules rather than inlining it', () => {
    for (const route of ROUTES.filter((r) => r.entry !== 'health')) {
      expect(emitted.get(route.entry)).toContain('@google/genai')
    }
  })

  it.each(ROUTES)('answers a request when run by Node itself, as the serverless runtime does ($entry)', async (route) => {
    // A separate process on purpose: an in-process import would resolve
    // through Vite's dev server and pass even when the deployed file is broken.
    const outfile = join(outDir, `${route.entry.replace(/\//g, '-')}.mjs`)
    // The status is reported alongside the body rather than inferred from it,
    // so a route that answers 200 with an error body fails here.
    const script = `
      const { default: handler } = await import(${JSON.stringify(outfile)})
      let body = ''
      const res = {
        statusCode: 200,
        setHeader() {},
        end(chunk) { body = String(chunk) },
      }
      await handler(${JSON.stringify(route.request)}, res)
      process.stdout.write(JSON.stringify({ status: res.statusCode, body }))
    `
    const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script], { cwd: root })
    const { status, body: raw } = JSON.parse(stdout) as { status: number; body: string }
    const body = JSON.parse(raw) as {
      ok: boolean
      data?: { status?: string; ai?: { configured: boolean; model: string } }
      error?: { code: string; message: string }
    }

    expect(status).toBe(route.expectStatus)
    // A well-formed envelope is the assertion. If the bundle failed to load,
    // Node would have thrown before writing anything and stdout would be empty.
    // `ok` must agree with the presence of an error; a half-written envelope is
    // what a client cannot recover from.
    expect(body.ok).toBe(body.error === undefined)
    if (route.entry === 'health') {
      expect(body.data?.status).toBe('healthy')
      // With no key configured the probe must still answer, reporting only a
      // boolean. If this ever leaks a value it is a secret crossing the boundary.
      expect(typeof body.data?.ai?.configured).toBe('boolean')
    } else {
      expect(body.error?.code).toBe('not_configured')
    }
  }, 120_000)
})

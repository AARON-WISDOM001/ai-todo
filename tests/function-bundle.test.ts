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
 * resolve perfectly well under Vite. So this bundles a route the way the build
 * does, then runs the output in a separate Node process the way Vercel does. It
 * is the only test in the suite that exercises the artefact we actually deploy.
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
const outfile = join(outDir, 'health.mjs')

let emitted = ''

beforeAll(async () => {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  await build({
    entryPoints: [join(root, 'server', 'routes', 'health.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['@google/genai'],
    logLevel: 'silent',
  })
  emitted = await readFile(outfile, 'utf8')
}, 60_000)

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

describe('deployed function bundle', () => {
  it('leaves no relative TypeScript import for Node to fail to resolve', () => {
    // The exact failure: a specifier that survives bundling and points at a
    // file that only exists in the source tree.
    expect(emitted).not.toMatch(/from\s*["'][^"']*\.ts["']/)
    expect(emitted).not.toMatch(/import\s*\(\s*["'][^"']*\.ts["']\s*\)/)
  })

  it('still imports the Gemini SDK from node_modules rather than inlining it', () => {
    expect(emitted).toContain('@google/genai')
  })

  it('answers a request when run by Node itself, as the serverless runtime does', async () => {
    // A separate process on purpose: an in-process import would resolve
    // through Vite's dev server and pass even when the deployed file is broken.
    const script = `
      const { default: handler } = await import(${JSON.stringify(outfile)})
      const res = {
        statusCode: 200,
        setHeader() {},
        end(chunk) { process.stdout.write(String(chunk)) },
      }
      handler({ method: 'GET', headers: {} }, res)
    `
    const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
    })
    const body = JSON.parse(stdout) as {
      ok: boolean
      data: { status: string; ai: { configured: boolean; model: string } }
    }
    expect(body.ok).toBe(true)
    expect(body.data.status).toBe('healthy')
    // With no key configured the probe must still answer, reporting only a
    // boolean. If this ever leaks a value it is a secret crossing the boundary.
    expect(typeof body.data.ai.configured).toBe('boolean')
  }, 60_000)
})

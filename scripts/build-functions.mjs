/**
 * Bundles each serverless route into a single self-contained file under `api/`.
 *
 * Vercel's Node builder transpiles an entry file in place; it does not follow
 * relative imports into sibling TypeScript. With `"type": "module"` it emits
 * ESM, so the specifier `../../shared/ai.ts` survives into the output as-is and
 * Node fails at import time with ERR_MODULE_NOT_FOUND — the build reports
 * success while every request 500s with FUNCTION_INVOCATION_FAILED.
 *
 * Bundling removes the class of problem entirely: after this runs, a function
 * has no relative imports left to resolve, so nothing about the deploy
 * environment's module resolution can break it. `api/` is generated and
 * gitignored; the sources of truth are `server/routes/**` and the shared and
 * server modules they pull in.
 *
 * `@google/genai` stays external. It is a real dependency, Vercel traces
 * `node_modules` reliably, and inlining the SDK would put megabytes of
 * generated code in the diff for no benefit.
 */

import { readdir, rm, mkdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = join(root, 'server', 'routes')
const outRoot = join(root, 'api')

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collect(full)))
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

const routes = await collect(sourceRoot)
await rm(outRoot, { recursive: true, force: true })
await mkdir(outRoot, { recursive: true })

for (const route of routes) {
  const outfile = join(outRoot, relative(sourceRoot, route).replace(/\.ts$/, '.js'))
  await mkdir(join(outfile, '..'), { recursive: true })
  await build({
    entryPoints: [route],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['@google/genai'],
    legalComments: 'none',
    logLevel: 'warning',
  })
  console.log(`built ${relative(root, outfile)}`)
}

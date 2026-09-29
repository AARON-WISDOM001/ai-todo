/**
 * Mounts the `/api` serverless functions inside the Vite dev server.
 *
 * Without this, `npm run dev` would only serve the frontend and every AI
 * request would 404, forcing contributors to install the Vercel CLI just to work
 * on the app. With it, the dev server and the deployed app run the *same*
 * handler code, so there is no dev-only code path to drift out of sync.
 *
 * Dev-only: the plugin returns `undefined` outside `serve`, so it adds nothing
 * to a production bundle.
 */

import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

type Handler = (req: unknown, res: unknown) => void | Promise<void>

interface ApiModule {
  default: Handler
}

/** `/api/ai/create` -> `api/ai/create` */
function modulePathFor(url: string): string | null {
  const path = url.split('?')[0] ?? ''
  if (!path.startsWith('/api/')) return null
  const relative = path.slice('/api/'.length).replace(/\/+$/, '')
  if (relative.length === 0 || relative.includes('..')) return null
  return relative
}

export function apiDevServer(): Plugin {
  return {
    name: 'ai-todo:api-dev-server',
    apply: 'serve',
    configureServer(server) {
      // The handlers read `process.env`, which is how they work on Vercel.
      // Vite only exposes `VITE_`-prefixed variables through `import.meta.env`,
      // so a `.env.local` holding `GEMINI_API_KEY` would be silently ignored and
      // every local AI request would fail with "not configured" while the same
      // file works fine in production. Mirroring the file into `process.env`
      // here is what makes local behaviour match deployed behaviour.
      //
      // Existing values win, so a real exported variable still takes priority
      // over the file.
      for (const [key, value] of Object.entries(loadEnv(server.config.mode, server.config.root, ''))) {
        if (process.env[key] === undefined) process.env[key] = value
      }

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? ''
        const modulePath = modulePathFor(url)
        if (!modulePath) return next()

        try {
          const module = (await server.ssrLoadModule(`/server/routes/${modulePath}.ts`)) as ApiModule
          const handler = module.default
          if (typeof handler !== 'function') {
            res.statusCode = 404
            res.end(JSON.stringify({ ok: false, error: { code: 'validation_error', message: 'Not found.', retryable: false } }))
            return
          }
          await handler(req, res)
        } catch (error) {
          server.config.logger.error(
            `[api] failed to load /server/routes/${modulePath}.ts\n${error instanceof Error ? error.stack ?? error.message : String(error)}`,
          )
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                ok: false,
                error: {
                  code: 'internal_error',
                  message: 'The API failed to start in development.',
                  retryable: false,
                },
              }),
            )
          }
        }
      })
    },
  }
}

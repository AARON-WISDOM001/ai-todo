# AI Todo

A task manager that understands what you say. Describe work in plain language and
it becomes structured tasks with priorities and dates; give it a big goal and it
breaks it into steps; ask it what to do next and it explains why.

Every AI suggestion is a **proposal**. Nothing is saved until you review and
confirm it.

---

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [How the AI features work](#how-the-ai-features-work)
- [Architecture](#architecture)
- [Design decisions](#design-decisions)
- [Testing](#testing)
- [Trade-offs and limitations](#trade-offs-and-limitations)
- [Deployment](#deployment)
- [Project layout](#project-layout)
- [Scripts](#scripts)

---

## What it does

A full task manager, first. Tasks have titles, descriptions, priorities, due
dates, and subtasks. You can filter by view (All, Today, Upcoming, Completed),
by priority, and by search; sort by due date, priority, or newest; and see
progress stats. It works on phone, tablet, and desktop, and it is fully usable
with a keyboard.

On top of that, four AI capabilities. Not a chatbot — four specific jobs:

| Capability | What it does | Where it lives |
| --- | --- | --- |
| **Create tasks** | Turns one sentence into one or more tasks with priorities and dates. "Email the client friday and book the venue" becomes two tasks. | `⌘J` / **Ask AI** |
| **Break down** | Splits one large task into 3–7 ordered, independently completable steps. | Task editor → **Break down** |
| **What next** | Reviews your open tasks and names the one to start, with reasoning. | Sidebar → **Ask AI what to do next** |
| **Improve** | Rewrites a vague title or description into something actionable. | Task editor → **Improve with AI** |

The model is **Google Gemini** (`gemini-3.8-flash` by default), reached through
serverless functions so the API key never reaches the browser.

---

## Quick start

Requires **Node 20.19+ or 22.12+** (Vite 8) and npm.

```bash
npm install
cp .env.example .env.local     # then paste your Gemini key in
npm run dev                    # http://localhost:5177
```

The app runs and every manual feature works with **no API key at all**. Asking
the AI shows a clear "not configured" message rather than failing silently. Add
a key to switch the four AI features on.

To get a key: [Google AI Studio](https://aistudio.google.com/apikey).

---

## Configuration

All variables are read on the server only. Copy `.env.example` to `.env.local`
for development, or set them in your Vercel project settings for production.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | For AI features | — | Gemini API key. |
| `GOOGLE_API_KEY` | Alternative | — | Accepted if `GEMINI_API_KEY` is unset. Matches the Google Cloud console's naming. |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` | Model id, if you want a different one. |

`GET /api/health` reports whether a key is present and which model is in use. It
never returns any part of the key, so it is safe to leave unauthenticated.

---

## How the AI features work

The interesting engineering is in the boundary between a language model and an
application that has to be correct. Four decisions do most of the work.

### 1. One schema, two jobs

Each capability has a Zod schema describing the model's reply. That single
schema is used to *generate the Gemini response schema* the model is asked to
fill, **and** to *validate the reply* when it arrives. They cannot drift apart,
because there is only one declaration.

`server/ai/json-schema.ts` converts Zod's JSON Schema output into Gemini's
dialect, which differs in ways that matter:

- Zod emits `"type": ["string", "null"]`; Gemini has no unions and wants
  `nullable: true`.
- Zod emits `minLength`, `minItems`, and friends; Gemini cannot express them.
  They are **dropped**, because the same Zod schema is re-run over the reply —
  the constraint is enforced, just not transmitted.
- Anything unsupported in a way that would *weaken* the contract throws at
  conversion time, so it fails a unit test rather than silently asking the model
  for less than we accept.

### 2. The model gets the date, because it cannot know it

"Next Friday" is meaningless to a model with no clock. Every request carries
`today` (as a local `YYYY-MM-DD` in the user's timezone) and the timezone, and
the prompts instruct the model to resolve relative dates against that. This is
the single highest-leverage detail for output quality.

### 3. Model output is hostile input

The reply is parsed as JSON and validated against the Zod schema the moment it
arrives. If it does not conform, it is discarded and the user gets a retryable
error. Zod *strips* unknown keys rather than rejecting the whole response, so a
model that adds a field does not break an otherwise good reply.

The prioritisation action goes further: the model is asked to only echo task ids
it was given, and that request is not treated as a guarantee. Unrecognised ids
are filtered out before they reach the UI, where they would become focus targets
pointing at nothing.

### 4. The AI never mutates data

No AI call writes anything. Every capability returns a proposal, the UI renders
it for review, and only a user action commits it. A hallucinated task is inert
until a person accepts it.

---

## Architecture

```
Browser (React)                Vercel                    Gemini
─────────────────             ──────────                ───────
UI components
    │
WorkspaceContext ── tasks ──▶ TaskRepository ──▶ localStorage
    │
    │ fetch /api/ai/*
    ▼
                          ┌──────────────┐
                          │server/routes/│  method, rate limit,
                          │  defineRoute │  body limit, validation
                          └──────┬───────┘
                                 │
                          server/ai/actions.ts   ← all model interaction
                                 │
                          server/ai/client.ts    ← key, timeout, Zod check
                                 │
                          @google/genai ─────────▶ Gemini
```

A few properties worth calling out:

- **One request funnel.** Every AI route is built with `defineRoute`, which
  applies the method guard, rate limit, body size limit, and schema validation
  before the handler sees anything. Route files are three lines long.
- **The key is server-only.** It is read in `server/ai/client.ts` and never
  reaches the bundle. Verified by the absence of `process.env` in the client
  build and by `api/health` reporting only a boolean.
- **Errors are safe by construction.** Only messages written in
  `server/_lib/errors.ts` cross the boundary. A third-party SDK error is logged
  in full server-side and reduced to one calm sentence for the browser — stack
  traces, request URLs, and quota internals do not leak.
- **The reducer is pure.** No clock, no randomness, no storage. Ids and
  timestamps are passed in, which is why the whole task domain is testable
  without mocking `Date` or `crypto`.
- **Dev and production share handlers.** A small Vite plugin mounts the same
  `api/` handlers in dev, so local behaviour matches Vercel instead of drifting.

---

## Design decisions

**Dates are date-only strings, not timestamps.** `dueDate` is `YYYY-MM-DD` in
the user's local timezone. "Due Friday" is a wall-clock concept; storing a
timestamp makes the same task render as a different day depending on who is
looking. Validation is strict — `2026-02-30` is rejected rather than silently
rolled into March, which matters because AI output passes through it.

**`localStorage` behind an interface.** Real durability across refreshes with no
database to provision, and the entire data layer is one file that a future
API-backed implementation can replace without touching the reducer or the UI. The
costs are real and stated in [Trade-offs](#trade-offs-and-limitations) rather than
hidden.

**A modal drawer, not a decorative overlay.** The mobile navigation drawer is a
real `role="dialog"` with `aria-modal`, a focus trap, Escape to close, and focus
restoration. A drawer that blocks the page behind it must not let a keyboard user
tab out into content they cannot see.

**Colour is never the only signal.** Priority and due-date urgency each have a
text label as well as a hue. Every colour pairing in the design system was
checked against WCAG AA contrast with a script, not by eye.

**Reduced motion is respected.** Animations are defined once and collapse to
near-instant under `prefers-reduced-motion`.

---

## Testing

```bash
npm test          # 160 tests
npm run test:watch
```

Coverage is organised by what could break, not by line count:

| Area | What is tested |
| --- | --- |
| `tests/dates.test.ts` | Strict calendar validation, timezone-safe formatting, due-date labels. |
| `tests/task-reducer.test.ts` | Every mutation, including parent/subtask completion rules and rejection of invalid patches. |
| `tests/task-selectors.test.ts` | Views, multi-term search, sorting, stats, sidebar counts. |
| `tests/task-storage.test.ts` | Round-tripping, corrupt data, newer-schema data, blocked storage. |
| `tests/ai-contract.test.ts` | Every request/response schema, including the cases a regex alone would miss. |
| `tests/ai-json-schema.test.ts` | Zod → Gemini conversion, nullable handling, and loud failure on unsupported constructs. |
| `tests/ai-actions.test.ts` | Each action's prompt context, and filtering of hallucinated task ids. |
| `tests/api-http.test.ts` | Method guard, body limits, validation, rate limiting, and that internal errors never leak. |
| `tests/app-flow.test.tsx` | The app driven like a person uses it: type, open, edit, complete, delete, filter, search, persist. |

Two real bugs were caught by this suite during development, both in the AI path:
the Gemini schema converter rejected Zod's own validation keywords, which would
have made **all four AI endpoints throw at runtime**; and one test expectation
did not match the app's deliberate treatment of overdue tasks as "due today".

There is also a browser-based UI audit:

```bash
npm run dev                # in one terminal
npm run ui:audit           # in another
```

`scripts/ui-audit.mjs` drives headless Chrome over the DevTools protocol across
mobile, tablet, and desktop, plus overlay states (command bar, task editor, mobile
drawer, empty search, completed view). It checks for console errors, horizontal
overflow, overlapping elements, unlabelled controls, missing regions, and
WCAG AA text contrast. Colour maths is delegated to the browser via a canvas,
because Tailwind v4 emits `oklch()` and a naive regex silently misreads it.

---

## Trade-offs and limitations

Stated plainly, because a README that only lists strengths is marketing.

- **Data is per-browser.** `localStorage` means no sync across devices, no
  accounts, and no server-side backup. Clearing site data deletes your tasks. A
  real product needs a backend; the `TaskRepository` interface is the seam where
  one would go.
- **Storage is bounded.** Roughly 5–10 MB. Unusually, this app tells you when it
  hits the limit rather than failing silently.
- **Rate limiting is per-instance.** A serverless function has no shared store,
  so `server/_lib/rate-limit.ts` is a best-effort fixed window (20 requests per
  minute per client). It reliably stops a runaway loop or a script hammering one
  instance; it is not a security control. Real abuse prevention belongs at the
  edge — Vercel firewall rules.
- **No authentication.** The AI endpoints are open to anyone who finds the URL,
  bounded only by the rate limiter. Adding auth is a prerequisite for a public
  launch.
- **No offline AI.** Without a key, the AI features do nothing. There is no local
  fallback; every manual feature keeps working.
- **Deleting a task is immediate**, with no undo and no confirmation. The row's
  delete button removes it outright. Undo would be better.
- **English only**, and only in the four supported capabilities.

---

## Deployment

Deployed to Vercel: static build for the SPA, serverless functions for `/api`.

`vercel.json` pins the build command and output directory, gives the functions a
30s ceiling, and sets security headers (nosniff, frame denial, a restrictive
permissions policy, and `no-store` on API responses).

```bash
npm i -g vercel
vercel            # preview
vercel --prod     # production
vercel env add GEMINI_API_KEY production
```

### Why `api/` is generated

Vercel's Node builder transpiles a function's entry file **in place**. It does
not follow relative imports into sibling TypeScript, so a handler that imports
`../../shared/ai.ts` produces JavaScript containing that exact specifier, and
Node throws `ERR_MODULE_NOT_FOUND` on the first request. The build reports
success, the SPA serves fine, and every API call returns
`FUNCTION_INVOCATION_FAILED`.

So route sources live in `server/routes/` and `npm run build` bundles each one
into a self-contained `api/**/*.js` with esbuild. A deployed function then has no
relative imports left to resolve, and nothing about the deploy environment's
module handling can break it. `@google/genai` stays external so it resolves from
`node_modules`, which Vercel traces reliably.

`api/` is generated and gitignored. `tests/function-bundle.test.ts` bundles a
route and runs the output in a separate Node process, which is the only test
that exercises the artefact actually deployed.

After the first deploy, set the canonical URL in `index.html` to the real domain.

---

## Project layout

```
server/routes/        Serverless handlers (thin — all logic in server/ and shared/)
  ai/create.ts        POST /api/ai/create
  ai/breakdown.ts     POST /api/ai/breakdown
  ai/prioritize.ts    POST /api/ai/prioritize
  ai/improve.ts       POST /api/ai/improve
  health.ts           GET  /api/health
server/
  _lib/               Request plumbing: errors, HTTP funnel, rate limit, types
  ai/actions.ts       The four capabilities, as pure request → response functions
  ai/client.ts        The only file that talks to Gemini
  ai/json-schema.ts   Zod → Gemini schema conversion
  ai/prompts.ts       System prompts
shared/               Imported by BOTH browser and server. No platform APIs.
  task.ts             Task domain model
  ai.ts               AI request/response contracts
api/                  GENERATED by scripts/build-functions.mjs. Gitignored.
  dates.ts            Date-key helpers
src/
  components/ui/      Button, Dialog, Input, Select, and other primitives
  features/tasks/     Reducer, repository, selectors, list, rows, editor
  features/ai/        Command bar, transport, review surfaces
  features/workspace/ Context, shell, sidebar, header
  lib/                cn(), the shared modal-behaviour hook
  styles/index.css    Tailwind v4 theme tokens
tests/                160 tests
scripts/ui-audit.mjs  Headless-Chrome layout, contrast, and a11y audit
```

---

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server with `/api` mounted from the real handlers. |
| `npm run build` | Typecheck, then build to `dist/`. |
| `npm test` | Run the test suite once. |
| `npm run test:watch` | Watch mode. |
| `npm run typecheck` | `tsc -b` across app, server, and tests. |
| `npm run lint` | oxlint. |
| `npm run check` | typecheck → lint → test → build. Run this before pushing. |
| `npm run ui:audit` | Browser UI audit; needs `npm run dev` running. |
| `npm run preview` | Serve the production build locally. |

---

Built with React 19, TypeScript 6, Vite 8, Tailwind CSS v4, Zod 4, and
`@google/genai`.

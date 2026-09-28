# AGENTS.md

Guidance for AI coding agents and humans working in this repository.

Read this before changing anything. The conventions below exist because the code
made specific decisions that are easy to accidentally undo.

---

## 1. Commands

```bash
npm run dev          # dev server on :5177, with /api mounted from real handlers
npm test             # 160 tests
npm run typecheck    # tsc -b across app, server, and tests
npm run lint         # oxlint
npm run build        # typecheck + production build
npm run check        # all four, in order. Run before every commit.
```

`npm run check` is the gate. If it does not pass, the change is not finished.

`npm run ui:audit` additionally runs a headless-Chrome audit; it needs
`npm run dev` running in another terminal. Run it after any change to layout,
colour, or focus behaviour.

## 2. Never commit secrets

- `GEMINI_API_KEY` and `GOOGLE_API_KEY` are server-only. `.env*` is gitignored
  except `.env.example`.
- No new environment variable may be read from `src/`. Client code must not
  reference `process.env` at all — the browser has no such thing, and a
  `import.meta.env` reference to a secret name will be bundled.
- The key must never appear in a response body, a log line, or an error message.
  `api/health` reports a boolean, never a value. The route source is
  `server/routes/health.ts`; `api/` itself is generated.

## 3. `shared/` is the contract

`shared/` is imported by both the browser bundle and the serverless functions.

- No React, no DOM, no Node APIs, no `import.meta.env`, no `process.env`.
  It must be importable from both environments unchanged.
- A type or schema added here is simultaneously an API contract and a UI
  guarantee. Changing one changes both.
- `shared/task.ts` is the source of truth for task shape. `shared/ai.ts` is the
  source of truth for what the model may return.

## 4. AI boundaries — the rules that matter most

**The AI never writes user data.** Every capability returns a proposal. The UI
renders it for review. Only a user action commits it. Do not add a code path
where a model response is saved directly.

**Model output is untrusted.** Every response is validated against its Zod
schema before use. If validation fails, discard the response and raise a
retryable error. Never read fields off a model response without validating it
first.

**The model cannot know today's date.** Every AI request must carry `today` and
`timezone`. Prompts must instruct the model to resolve relative dates against
the injected `today`. If you add an AI capability, carry the date context.

**The model may hallucinate identifiers.** Any id the model returns must be
checked against the set of ids that were sent. See the `known` filter in
`server/ai/actions.ts`.

**One schema per response, used twice.** Derive the Gemini response schema from
the Zod schema via `toGeminiSchema`; do not hand-write response schemas. If
`json-schema.ts` cannot represent a construct, it throws on purpose — extend the
converter and add a test rather than working around it.

**Errors must be safe by construction.** Only messages from
`server/_lib/errors.ts` may cross the network boundary. Throw `AppError`
subclasses; anything else becomes a generic `internal_error` with the detail
logged server-side.

## 5. The reducer stays pure

`src/features/tasks/task-reducer.ts` must not touch `Date`, `crypto`, `Math.random`,
or storage. Ids and timestamps are passed in via the action or the `createTask`
factory.

This is not purity for its own sake: it is the reason the whole task domain is
testable without mocking globals. If you need a clock or a random id inside a
transition, generate it in the caller and pass it down.

Reducer invariants worth preserving:

- Completing a task completes its subtasks.
- A task with subtasks cannot be complete while any subtask is open.
- Adding open subtasks reopens the task.
- An invalid patch field is ignored, not applied.

## 6. Dates are date-only strings

`dueDate` is `YYYY-MM-DD` in the user's local timezone — never a timestamp, never
a `Date` object in state.

- Validate with `isValidDateKey`, which rejects impossible dates like
  `2026-02-30`. Do not substitute a regex.
- Build them with `toDateKey` (local fields), never `toISOString()` (UTC) — that
  is the bug that makes a task due tonight show up tomorrow.
- `shared/ai.ts` uses a `modelDateKey` that applies `isValidDateKey`, because
  model output flows through the same check.

## 7. Styling

Tailwind CSS v4. Theme tokens live in `src/styles/index.css`; do not introduce
raw hex values in components.

- Colours: `bg-canvas`, `bg-surface`, `bg-surface-sunken`, `border-line`,
  `text-ink`, `text-ink-secondary`, `text-ink-tertiary`, `text-accent`,
  `text-urgent`, `text-success`.
- New semantic tokens must be defined in `@theme` and pass WCAG AA contrast.
  `npm run ui:audit` checks this; do not eyeball it.
- Colour is never the only signal. Every state that changes colour also changes
  text or an icon.
- Animations use the `--animate-*` custom properties, and every one must
  collapse under `prefers-reduced-motion`.
- Use `h-dvh`, not `h-screen`, so mobile browser chrome does not clip the layout.

## 8. Accessibility is a requirement, not a polish step

- Every interactive element needs an accessible name. Icon-only controls use
  `IconButton` with a `label`.
- Anything that blocks the page behind it — dialogs, the mobile drawer — is a
  `role="dialog"` with `aria-modal`, a focus trap, Escape to close, and focus
  restoration. Use `useModalBehaviour`; do not hand-roll a second implementation.
- Skip link, visible focus rings, and keyboard operability are required.
- `npm run ui:audit` catches unlabelled controls, overlap, overflow, and contrast.
  It is not optional before finishing a UI change.

## 9. Comments explain why, not what

The codebase documents decisions and trade-offs, not mechanics. A comment earns
its place by answering "why this way and not the obvious way?".

- Explain a non-obvious constraint, a rejected alternative, or a failure that
  this code prevents.
- Do not narrate the code. `// increment i` is noise; `// Stop buffering past the
  cap; the handler will reject on size` is useful.
- Do not add comments to code that is already self-evident. Prefer extracting a
  well-named function over commenting a confusing one.

## 10. Tests

- Every bug fixed gets a test that fails before the fix. This is non-negotiable.
- Tests describe behaviour in user terms: "marks a task done and moves it out of
  the active list", not "dispatches toggle and updates state".
- Do not mock more than necessary. `tests/app-flow.test.tsx` deliberately runs
  against the real `localStorage` and a realistic API envelope, because a mock
  that always succeeds only proves the mock works.
- When adding an AI capability, test: the schema conversion, the rejection of
  malformed model output, and the filtering of invented ids.
- Fixtures live in `tests/fixtures/tasks.ts`. Use `makeTask({ ...overrides })`
  rather than writing out full task objects.

## 11. Adding an AI capability

1. Add the request and response Zod schemas to `shared/ai.ts`, with date
   context. Do not add anything the UI cannot review.
2. Add the label to `AI_ACTION_LABELS` and the endpoint to `AI_ENDPOINTS`.
3. Add the system prompt to `server/ai/prompts.ts`. State how relative dates
   resolve and that invented deadlines are forbidden.
4. Add the action to `server/ai/actions.ts`, keeping it a pure
   request → response function with all model interaction in `client.ts`.
5. Add the route in `server/routes/ai/`, which should stay a three-line
   `defineRoute` call. Not in `api/` — see section 16.
6. Add the entry point to `ai-command-bar.tsx`, disabled when its preconditions
   are unmet.
7. Add tests: schema conversion, validation of a malformed reply, invented-id
   filtering, and the UI path.

## 12. Adding a task feature

1. Decide whether it is a state transition. If so, add it to `taskReducer` as a
   pure action and test the invariants in section 5.
2. If it changes what is visible, add a selector to `task-selectors.ts` rather
   than filtering inside a component.
3. If it can be done with a keyboard, it must be.
4. Add it to the UI audit scenarios if it introduces a new overlay or layout state.

## 13. Before you commit

- `npm run check` passes.
- `npm run ui:audit` passes if you touched layout, colour, or focus.
- No secret, key, or `.env.local` is staged.
- `git diff --staged` reviewed. Nothing unintended, no debug logging, no
  commented-out code.
- Commits are meaningful: one logical change per commit, message explaining
  *why* not *what*.

## 14. Things that will cause problems

- `new Date().toISOString()` used to build a date key. UTC. See section 6.
- A hand-written Gemini response schema. See section 4.
- A second focus-trap implementation. See section 8.
- `localStorage` accessed outside `task-repository.ts`. It needs the quota and
  blocked-storage handling, and the UI needs the failure surfaced.
- A new raw colour in a component. See section 7.
- Mocking `fetch` to always succeed in a test of a failure path.
- Assuming the current user is one. The Today view, due-date labels, and
  `now`-dependent selectors must accept an injected `Date` for testability.
- Writing a route into `api/`. That directory is generated and gitignored; see
  section 16.

## 16. `api/` is generated, not authored

Route sources live in `server/routes/`. `npm run build` bundles each one into a
self-contained `api/**/*.js` via `scripts/build-functions.mjs`, and Vercel
deploys that.

This is not a preference. Vercel's Node builder transpiles a function's entry
file in place and does not follow relative imports into sibling TypeScript, so a
handler importing `../../shared/ai.ts` emits JavaScript containing that literal
specifier. Node then throws `ERR_MODULE_NOT_FOUND` and every request returns
`FUNCTION_INVOCATION_FAILED` — while the build reports success and the static
app works fine, so nothing local reveals the problem.

Rules:

- Never commit `api/`. It is gitignored and regenerated on every build.
- Never add a route there directly. Add it under `server/routes/`.
- The dev server mounts the real handlers from `server/routes/` through
  `vite-plugins/api-dev-server.ts`, so local and deployed behaviour cannot drift.
- `tests/function-bundle.test.ts` bundles a route and runs it in a separate Node
  process. It is the only test that exercises the deployed artefact; if you
  change the bundler, it is the test that will notice.

## 15. Current state

- Deployed: Vercel (static SPA + serverless `/api`).
- Persistence: `localStorage`, versioned under `ai-todo:tasks:v1`.
- AI: Gemini via `@google/genai`; key required, all manual features work without it.
- Known gaps: no auth, per-instance rate limiting only, no undo on delete,
  English only, no cross-device sync.

/**
 * Vitest setup.
 *
 * Two things matter here: jest-dom's matchers so assertions read as behaviour
 * rather than as DOM trivia, and an explicit cleanup. The automatic cleanup in
 * `@testing-library/react` is skipped under `globals: true` in some versions,
 * and a leaked DOM between tests produces failures that look like real bugs in
 * the component under test.
 */

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

beforeEach(() => {
  // Every test starts with empty storage, so persisted state from a previous
  // test can never make the next one pass or fail for the wrong reason.
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

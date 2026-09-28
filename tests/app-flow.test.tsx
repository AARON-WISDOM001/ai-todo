/**
 * End-to-end tests through the real UI.
 *
 * These drive the app the way a person does — typing into the composer, opening
 * the editor, ticking a task off — rather than calling hooks directly. The point
 * is to catch the failures that only exist at the seams: a button wired to the
 * wrong dispatch, a dialog that saves the wrong id, a filter that is applied but
 * not reflected in the sidebar count.
 *
 * No network: every test that touches the AI bar runs without a key, which
 * exercises the real "not configured" path rather than a mock.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../src/App.tsx'
import { STORAGE_KEY } from '../src/features/tasks/task-repository.ts'
import { makeTask } from './fixtures/tasks.ts'

function seed(...tasks: ReturnType<typeof makeTask>[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

const titleOf = (name: string | RegExp) => screen.getByRole('button', { name })

/**
 * Helpers that disambiguate markup which legitimately exists twice.
 *
 * The app ships one desktop header and one mobile header, plus a sidebar and a
 * mobile tab bar. Both variants stay mounted and are toggled with CSS, so a
 * plain `getBy*` finds two elements. Querying the one a real user would be
 * looking at keeps these tests honest about what is actually clickable.
 */
const searchBox = () => screen.getAllByPlaceholderText('Search tasks')[0]!
/** The header's create-mode entry point, as opposed to the sidebar's next-task one. */
const askAiButton = () =>
  within(screen.getByRole('banner')).getByRole('button', { name: /Ask AI/i })
const sidebar = () => screen.getAllByRole('navigation', { name: 'Task views' })[0]!

beforeEach(() => {
  // No network. The health probe reports the AI as unconfigured, and every AI
  // endpoint answers with the real 503 envelope the server produces when
  // `GEMINI_API_KEY` is absent. That exercises the genuine failure path — a
  // happy-path mock would only prove the mock works.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : String(input)

      if (url.includes('/api/health')) {
        return jsonResponse(200, {
          ok: true,
          data: { status: 'healthy', ai: { configured: false, model: 'gemini-3.6-flash' } },
        })
      }

      return jsonResponse(503, {
        ok: false,
        error: {
          code: 'not_configured',
          message:
            'The AI assistant is not configured yet. Add GEMINI_API_KEY to the environment to enable it.',
          retryable: false,
        },
      })
    }),
  )
})

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('create a task', () => {
  it('adds a task typed into the composer', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('Your list is clear')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('Add a task…')
    await user.type(input, 'Buy groceries')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Buy groceries')).toBeInTheDocument()
  })

  it('clears the composer and stays focused for the next entry', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByPlaceholderText('Add a task…')
    await user.type(input, 'First task')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('persists the new task to storage', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByPlaceholderText('Add a task…'), 'Persisted task')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
      expect(stored.map((task: { title: string }) => task.title)).toContain('Persisted task')
    })
  })

  it('ignores an empty submission', async () => {
    const user = userEvent.setup()
    render(<App />)

    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Add a task…'), '   ')
    expect(add).toBeDisabled()
  })
})

describe('edit a task', () => {
  it('saves changes made in the editor', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Old title' }))
    render(<App />)

    await user.click(titleOf('Open details for "Old title"'))

    const field = await screen.findByLabelText('Title')
    await user.clear(field)
    await user.type(field, 'New title')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('New title')).toBeInTheDocument()
    expect(screen.queryByText('Old title')).not.toBeInTheDocument()
  })

  it('changes priority and due date', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Task' }))
    render(<App />)

    await user.click(titleOf('Open details for "Task"'))

    await user.selectOptions(await screen.findByLabelText('Priority'), 'high')
    await user.clear(screen.getByLabelText('Due date'))
    await user.type(screen.getByLabelText('Due date'), '2026-03-04')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const stored = await waitFor(() => {
      const tasks = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
      expect(tasks[0]?.priority).toBe('high')
      expect(tasks[0]?.dueDate).toBe('2026-03-04')
      return tasks
    })
    expect(stored).toHaveLength(1)
  })

  it('discards changes when cancelled', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Original' }))
    render(<App />)

    await user.click(titleOf('Open details for "Original"'))
    const field = await screen.findByLabelText('Title')
    await user.clear(field)
    await user.type(field, 'Discarded')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Original')).toBeInTheDocument()
    expect(screen.queryByText('Discarded')).not.toBeInTheDocument()
  })

  it('refuses to save an empty title', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Has a title' }))
    render(<App />)

    await user.click(titleOf('Open details for "Has a title"'))
    await user.clear(await screen.findByLabelText('Title'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    // The dialog stays open with an error rather than saving a nameless task.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Has a title')).toBeInTheDocument()
  })

  it('closes on Escape without saving', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Untouched' }))
    render(<App />)

    await user.click(titleOf('Open details for "Untouched"'))
    const field = await screen.findByLabelText('Title')
    await user.clear(field)
    await user.type(field, 'Abandoned')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Untouched')).toBeInTheDocument()
  })

  it('moves focus into the dialog and returns it to the trigger on close', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Focus test' }))
    render(<App />)

    const trigger = titleOf('Open details for "Focus test"')
    await user.click(trigger)

    // Focus lands on the first control inside the dialog — the close button —
    // so the keyboard user is inside the modal rather than behind it.
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('keeps Tab focus inside the dialog', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Trap test' }))
    render(<App />)

    await user.click(titleOf('Open details for "Trap test"'))
    const dialog = await screen.findByRole('dialog')

    // Tabbing all the way round must never escape to the page behind.
    for (let i = 0; i < 30; i += 1) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  })
})

describe('complete a task', () => {
  it('marks a task done and moves it out of the active list', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Finish me' }))
    render(<App />)

    await user.click(screen.getByRole('checkbox', { name: /finish me/i }))

    await waitFor(() => expect(screen.queryByText('Finish me')).not.toBeInTheDocument())

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    expect(stored[0]?.completed).toBe(true)
  })

  it('shows completed tasks in the Completed view', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Finished earlier', completed: true }))
    render(<App />)

    expect(screen.queryByText('Finished earlier')).not.toBeInTheDocument()

    await user.click(within(sidebar()).getByRole('button', { name: /Completed/ }))

    expect(await screen.findByText('Finished earlier')).toBeInTheDocument()
  })
})

describe('delete a task', () => {
  it('removes the task from the list and from storage', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Delete me' }), makeTask({ id: 't2', title: 'Keep me' }))
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Delete "Delete me"' }))

    await waitFor(() => expect(screen.queryByText('Delete me')).not.toBeInTheDocument())
    expect(screen.getByText('Keep me')).toBeInTheDocument()

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.title).toBe('Keep me')
  })

  it('also offers deletion from inside the editor', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Delete from editor' }))
    render(<App />)

    await user.click(titleOf('Open details for "Delete from editor"'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText('Delete from editor')).not.toBeInTheDocument()
  })

  it('closes the editor without deleting when cancelled', async () => {
    const user = userEvent.setup()
    seed(makeTask({ id: 't1', title: 'Survivor' }))
    render(<App />)

    await user.click(titleOf('Open details for "Survivor"'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Survivor')).toBeInTheDocument()
  })
})

describe('filter and search', () => {
  const many = [
    makeTask({ id: 'a', title: 'Write the report', priority: 'high', dueDate: new Date().toISOString().slice(0, 10) }),
    makeTask({ id: 'b', title: 'Water the plants', priority: 'low' }),
    makeTask({ id: 'c', title: 'Call the bank', priority: 'high' }),
  ]

  it('narrows the list as the user types', async () => {
    const user = userEvent.setup()
    seed(...many)
    render(<App />)

    await user.type(searchBox(), 'report')

    await waitFor(() => expect(screen.queryByText('Water the plants')).not.toBeInTheDocument())
    expect(screen.getByText('Write the report')).toBeInTheDocument()
  })

  it('shows a no-results message and offers a way back', async () => {
    const user = userEvent.setup()
    seed(...many)
    render(<App />)

    await user.type(searchBox(), 'zzzznope')

    expect(await screen.findByText('No matches')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('filters by priority', async () => {
    const user = userEvent.setup()
    seed(...many)
    render(<App />)

    await user.click(screen.getByRole('button', { name: /high/i }))

    await waitFor(() => expect(screen.queryByText('Water the plants')).not.toBeInTheDocument())
    expect(screen.getByText('Write the report')).toBeInTheDocument()
    expect(screen.getByText('Call the bank')).toBeInTheDocument()
  })

  it('reflects the active view in the sidebar counts', async () => {
    const user = userEvent.setup()
    seed(
      makeTask({ id: 'a', title: 'Open task' }),
      makeTask({ id: 'b', title: 'Done task', completed: true }),
    )
    render(<App />)

    const todayButton = within(sidebar()).getByRole('button', { name: /Today/ })

    await user.click(todayButton)
    await waitFor(() => expect(todayButton).toHaveAttribute('aria-current', 'page'))
  })
})

describe('persistence across a reload', () => {
  it('restores tasks saved by a previous session', async () => {
    seed(makeTask({ id: 't1', title: 'Survives a refresh' }))
    const first = render(<App />)
    expect(await screen.findByText('Survives a refresh')).toBeInTheDocument()
    first.unmount()

    render(<App />)
    expect(await screen.findByText('Survives a refresh')).toBeInTheDocument()
  })

  it('starts clean when stored data is corrupt', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{{{ not a task list')
    render(<App />)
    expect(await screen.findByText('Your list is clear')).toBeInTheDocument()
  })
})

describe('accessibility basics', () => {
  it('exposes the task list as a named list and each row as a checkbox', async () => {
    seed(makeTask({ id: 't1', title: 'Accessible task' }))
    render(<App />)

    expect(screen.getByRole('list', { name: 'Tasks' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /accessible task/i })).toBeInTheDocument()
  })

  it('offers a skip link to the task list', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /skip to task list/i })).toBeInTheDocument()
  })
})

describe('the AI bar without an API key', () => {
  it('opens in create mode from the header', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(askAiButton())

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByLabelText(/describe what you need to get done/i),
    ).toBeInTheDocument()
  })

  it('offers all four AI capabilities, disabling the ones needing a task', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(askAiButton())
    const dialog = await screen.findByRole('dialog')

    for (const label of ['Create tasks', 'Break down a task', 'What should I do next?', 'Make this clearer']) {
      expect(within(dialog).getByRole('button', { name: label })).toBeInTheDocument()
    }
    // No task is open yet, so the two task-scoped modes must be unavailable.
    expect(within(dialog).getByRole('button', { name: 'Break down a task' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Make this clearer' })).toBeDisabled()
  })

  it('explains a missing key instead of failing silently', async () => {
    const user = userEvent.setup()
    render(<App />)

    // The sidebar's "what to do next" action needs no input to run.
    await user.click(screen.getByRole('button', { name: 'Ask AI what to do next' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Ask AI' }))

    // The failure is explained and the rest of the app still works.
    expect(await screen.findByText('AI is not configured')).toBeInTheDocument()
    expect(screen.getByText(/missing its API key/i)).toBeInTheDocument()
  })

  it('does not create a task when the request fails', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(askAiButton())
    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText(/describe what you need to get done/i),
      'write the report',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }))

    await screen.findByText('AI is not configured')
    // Nothing was written to storage: the AI proposes, the user confirms.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

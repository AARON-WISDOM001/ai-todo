import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { NotesView } from '../src/features/notes/notes-view.tsx'
import { NOTES_STORAGE_KEY } from '../src/features/notes/notes-repository.ts'

describe('personal notes', () => {
  it('creates and saves a note so it is available after reopening Notes', async () => {
    const user = userEvent.setup()
    const firstRender = render(<NotesView />)

    await user.click(screen.getByRole('button', { name: 'Write a note' }))
    await user.type(screen.getByRole('textbox', { name: 'Note title' }), 'Meeting notes')
    await user.type(screen.getByRole('textbox', { name: 'Note text' }), 'Ask Maya about the launch date.')

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(NOTES_STORAGE_KEY) ?? '[]')
      expect(stored[0]).toMatchObject({
        title: 'Meeting notes',
        body: 'Ask Maya about the launch date.',
      })
    })

    firstRender.unmount()
    render(<NotesView />)

    expect(screen.getByRole('textbox', { name: 'Note title' })).toHaveValue('Meeting notes')
    expect(screen.getByRole('textbox', { name: 'Note text' })).toHaveValue(
      'Ask Maya about the launch date.',
    )
  })

  it('deletes the selected note', async () => {
    const user = userEvent.setup()
    render(<NotesView />)

    await user.click(screen.getByRole('button', { name: 'Write a note' }))
    await user.type(screen.getByRole('textbox', { name: 'Note title' }), 'Temporary note')
    await user.click(screen.getByRole('button', { name: 'Delete note' }))

    expect(screen.getByText('A place for the extra details')).toBeInTheDocument()
    await waitFor(() => expect(window.localStorage.getItem(NOTES_STORAGE_KEY)).toBe('[]'))
  })

  it('loads valid notes and ignores malformed stored entries', () => {
    window.localStorage.setItem(
      NOTES_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'known',
          title: 'Saved note',
          body: 'Keep this.',
          createdAt: '2026-09-29T10:00:00.000Z',
          updatedAt: '2026-09-29T10:00:00.000Z',
        },
        { id: 'broken', title: 'Missing timestamps' },
      ]),
    )

    render(<NotesView />)

    expect(screen.getByRole('textbox', { name: 'Note title' })).toHaveValue('Saved note')
    expect(screen.getByRole('textbox', { name: 'Note text' })).toHaveValue('Keep this.')
  })
})
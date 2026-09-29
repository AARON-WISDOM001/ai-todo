import { useEffect, useState } from 'react'

import { Button } from '../../components/ui/button.tsx'
import { IconButton } from '../../components/ui/icon-button.tsx'
import { cn } from '../../lib/cn.ts'
import { newId } from '../tasks/task-reducer.ts'
import { notesRepository, type Note } from './notes-repository.ts'

export function NotesView() {
  const [notes, setNotes] = useState<Note[]>(() => notesRepository.load())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const selected = notes.find((note) => note.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId === null && notes.length > 0) setSelectedId(notes[0]!.id)
  }, [notes, selectedId])

  useEffect(() => {
    try {
      notesRepository.save(notes)
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [notes])

  const createNote = () => {
    const now = new Date().toISOString()
    const note: Note = {
      id: newId(),
      title: '',
      body: '',
      createdAt: now,
      updatedAt: now,
    }
    setNotes((current) => [note, ...current])
    setSelectedId(note.id)
  }

  const updateSelected = (patch: Pick<Note, 'title' | 'body'>) => {
    if (!selected) return
    setNotes((current) =>
      current.map((note) =>
        note.id === selected.id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note,
      ),
    )
  }

  const deleteSelected = () => {
    if (!selected) return
    const remaining = notes.filter((note) => note.id !== selected.id)
    setNotes(remaining)
    setSelectedId(remaining[0]?.id ?? null)
  }

  return (
    <section aria-label="Notes" className="flex min-h-0 flex-1 flex-col px-3 pb-4 sm:px-5">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-3">
        <p className="text-sm text-ink-secondary">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          <span className="ml-2 text-xs text-ink-tertiary" role="status" aria-live="polite">
            {saveError ? 'Could not save notes' : 'Saved on this device'}
          </span>
        </p>
        <Button variant="primary" size="sm" onClick={createNote} iconStart={<PlusIcon />}>
          New note
        </Button>
      </div>

      {notes.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-10">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 grid size-11 place-items-center rounded-md border border-line bg-surface text-ink-tertiary">
              <NoteIcon />
            </div>
            <h2 className="text-base font-semibold text-ink">A place for the extra details</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
              Keep ideas, meeting notes, and useful details separate from your task list.
            </p>
            <Button variant="secondary" className="mt-4" onClick={createNote} iconStart={<PlusIcon />}>
              Write a note
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(5.5rem,30%)_minmax(0,1fr)] gap-3 py-3 md:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)] md:grid-rows-1">
          <nav aria-label="Your notes" className="scrollbar-subtle flex min-h-0 gap-2 overflow-auto md:flex-col md:gap-1">
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                aria-pressed={selectedId === note.id}
                onClick={() => setSelectedId(note.id)}
                className={cn(
                  'flex min-w-40 flex-1 flex-col items-start overflow-hidden rounded-md border px-3 py-2 text-left transition-colors md:min-w-0 md:flex-none',
                  selectedId === note.id
                    ? 'border-line-strong bg-surface'
                    : 'border-transparent hover:bg-surface/70',
                )}
              >
                <span className="w-full truncate text-[13px] font-medium text-ink">
                  {note.title.trim() || 'Untitled note'}
                </span>
                <span className="mt-0.5 w-full truncate text-xs text-ink-tertiary">
                  {note.body.trim() || 'No text yet'}
                </span>
                <time className="mt-1 text-[11px] text-ink-tertiary" dateTime={note.updatedAt}>
                  {new Date(note.updatedAt).toLocaleDateString()}
                </time>
              </button>
            ))}
          </nav>

          {selected && (
            <div className="flex min-h-0 flex-col border-t border-line pt-3 md:border-t-0 md:border-l md:pl-5 md:pt-0">
              <div className="flex shrink-0 items-center gap-2">
                <input
                  aria-label="Note title"
                  value={selected.title}
                  onChange={(event) => updateSelected({ title: event.target.value.slice(0, 120), body: selected.body })}
                  placeholder="Untitled note"
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 text-lg font-semibold text-ink placeholder:text-ink-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <IconButton label="Delete note" onClick={deleteSelected} className="shrink-0 text-ink-tertiary hover:text-urgent">
                  <TrashIcon />
                </IconButton>
              </div>
              <textarea
                aria-label="Note text"
                value={selected.body}
                onChange={(event) => updateSelected({ title: selected.title, body: event.target.value })}
                placeholder="Write something worth remembering…"
                className="scrollbar-subtle min-h-0 flex-1 resize-none border-0 bg-transparent py-3 text-sm leading-7 text-ink placeholder:text-ink-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
      <path d="M5 2.75h7l3 3v11.5H5zM12 2.75v3h3M7.5 9h5M7.5 12h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <path d="M3 4.25h10M6.5 4.25V3h3v1.25M4.5 4.25l.55 8a1 1 0 001 .9h3.9a1 1 0 001-.9l.55-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
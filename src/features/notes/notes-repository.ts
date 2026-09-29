export interface Note {
  id: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'ai-todo:notes:v1'

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== 'object') return false
  const note = value as Record<string, unknown>
  return (
    typeof note.id === 'string' &&
    typeof note.title === 'string' &&
    typeof note.body === 'string' &&
    typeof note.createdAt === 'string' &&
    Number.isFinite(Date.parse(note.createdAt)) &&
    typeof note.updatedAt === 'string' &&
    Number.isFinite(Date.parse(note.updatedAt))
  )
}

export const notesRepository = {
  load(): Note[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isNote) : []
    } catch {
      return []
    }
  },

  save(notes: Note[]): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  },
}

export { STORAGE_KEY as NOTES_STORAGE_KEY }
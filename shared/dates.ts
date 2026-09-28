/**
 * Date helpers built around `YYYY-MM-DD` "date keys".
 *
 * The whole app reasons about due dates as date-only strings in the user's
 * local timezone. Every function here is pure and timezone-naive by design:
 * a task due "next Friday" must not shift to Thursday for someone in another
 * region, and a stored value must survive a round trip unchanged.
 */

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Formats a Date as a local `YYYY-MM-DD` key. */
export function toDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Strictly validates a `YYYY-MM-DD` string.
 *
 * Rejects malformed strings AND impossible dates such as `2026-02-30`, which
 * `new Date()` would silently roll over into March. AI output passes through
 * here, so the strictness is load-bearing.
 */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false

  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  )
}

/** Parses a date key into a local Date at midnight, or null if invalid. */
export function parseDateKey(value: string): Date | null {
  if (!isValidDateKey(value)) return null
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

/** Today in the user's local timezone. */
export function todayKey(now: Date = new Date()): string {
  return toDateKey(now)
}

/** ISO date keys sort correctly with plain string comparison. */
export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Returns the date key `days` after `key`. */
export function addDays(key: string, days: number): string {
  const date = parseDateKey(key)
  if (!date) return key
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const start = parseDateKey(from)
  const end = parseDateKey(to)
  if (!start || !end) return 0
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'upcoming' | 'none'

export interface FormattedDueDate {
  /** Short human label, e.g. "Today", "Tomorrow", "Fri, 25 Sep". */
  label: string
  /** Relative qualifier, e.g. "in 3 days" or "2 days ago". */
  relative: string | null
  tone: DueTone
  iso: string
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Turns a due date into a display label plus a semantic tone.
 *
 * The tone drives colour, but colour is never the only signal: every caller
 * also renders the textual `label`, so priority and urgency stay legible to
 * users who cannot distinguish the accent hues.
 */
export function formatDueDate(
  dueDate: string,
  now: Date = new Date(),
): FormattedDueDate | null {
  if (!isValidDateKey(dueDate)) return null

  const today = toDateKey(now)
  const diff = daysBetween(today, dueDate)
  const date = parseDateKey(dueDate)!

  const dayOfMonth = date.getDate()
  const month = MONTH_SHORT[date.getMonth()] ?? ''
  const weekday = WEEKDAY_SHORT[date.getDay()] ?? ''

  let label: string
  let tone: DueTone

  if (diff === 0) {
    label = 'Today'
    tone = 'today'
  } else if (diff === 1) {
    label = 'Tomorrow'
    tone = 'soon'
  } else if (diff === -1) {
    label = 'Yesterday'
    tone = 'overdue'
  } else if (diff < 0) {
    label = `${weekday}, ${dayOfMonth} ${month}`
    tone = 'overdue'
  } else if (diff <= 7) {
    label = weekday
    tone = 'soon'
  } else {
    label = `${weekday}, ${dayOfMonth} ${month}`
    tone = 'upcoming'
  }

  let relative: string | null = null
  if (diff !== 0) {
    relative = diff > 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`
  }

  return { label, relative, tone, iso: dueDate }
}

/** True when the task is unfinished and its due date has already passed. */
export function isOverdue(dueDate: string | null, completed: boolean, now: Date = new Date()): boolean {
  if (completed || !dueDate) return false
  return compareDateKeys(dueDate, toDateKey(now)) < 0
}

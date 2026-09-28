import { describe, expect, it } from 'vitest'

import {
  addDays,
  compareDateKeys,
  daysBetween,
  formatDueDate,
  isOverdue,
  isValidDateKey,
  parseDateKey,
  todayKey,
  toDateKey,
} from '../shared/dates.ts'
import { NOW, TODAY } from './fixtures/tasks.ts'

describe('isValidDateKey', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDateKey('2026-01-15')).toBe(true)
    expect(isValidDateKey('2024-02-29')).toBe(true) // leap year
  })

  it('rejects impossible dates that a regex alone would let through', () => {
    // The point of this file: `new Date('2026-02-30')` silently rolls into
    // March, so pattern matching is not enough.
    expect(isValidDateKey('2026-02-30')).toBe(false)
    expect(isValidDateKey('2025-02-29')).toBe(false) // not a leap year
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('2026-00-10')).toBe(false)
    expect(isValidDateKey('2026-04-31')).toBe(false)
  })

  it('rejects anything that is not exactly YYYY-MM-DD', () => {
    for (const value of [
      '2026-1-15',
      '15-01-2026',
      '2026/01/15',
      '2026-01-15T00:00:00Z',
      ' 2026-01-15',
      '2026-01-15 ',
      'not a date',
      '',
    ]) {
      expect(isValidDateKey(value), value).toBe(false)
    }
  })

  it('rejects non-strings', () => {
    expect(isValidDateKey(undefined)).toBe(false)
    expect(isValidDateKey(null)).toBe(false)
    expect(isValidDateKey(20260115)).toBe(false)
    expect(isValidDateKey(new Date())).toBe(false)
  })
})

describe('toDateKey / todayKey', () => {
  it('formats using local calendar fields, not UTC', () => {
    // Late-evening local time is the classic case: `toISOString()` would report
    // the next day for anyone east of Greenwich.
    const lateEvening = new Date(2026, 0, 15, 23, 30, 0)
    expect(toDateKey(lateEvening)).toBe('2026-01-15')
    expect(todayKey(lateEvening)).toBe('2026-01-15')
  })

  it('zero-pads months and days', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('parseDateKey', () => {
  it('returns local midnight', () => {
    const parsed = parseDateKey('2026-01-15')
    expect(parsed).not.toBeNull()
    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(0)
    expect(parsed?.getDate()).toBe(15)
    expect(parsed?.getHours()).toBe(0)
  })

  it('returns null for invalid input rather than an Invalid Date', () => {
    expect(parseDateKey('2026-02-30')).toBeNull()
    expect(parseDateKey('nope')).toBeNull()
  })
})

describe('compareDateKeys', () => {
  it('orders by calendar date', () => {
    expect(compareDateKeys('2026-01-15', '2026-01-16')).toBe(-1)
    expect(compareDateKeys('2026-01-16', '2026-01-15')).toBe(1)
    expect(compareDateKeys('2026-01-15', '2026-01-15')).toBe(0)
  })
})

describe('addDays / daysBetween', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('is lossless in both directions', () => {
    expect(addDays(TODAY, 10)).toBe('2026-01-25')
    expect(daysBetween(TODAY, '2026-01-25')).toBe(10)
    expect(daysBetween('2026-01-25', TODAY)).toBe(-10)
  })

  it('returns the input unchanged when it is not a real date', () => {
    expect(addDays('2026-02-30', 5)).toBe('2026-02-30')
    expect(daysBetween('nope', TODAY)).toBe(0)
  })
})

describe('formatDueDate', () => {
  it('labels today, tomorrow, and yesterday', () => {
    expect(formatDueDate(TODAY, NOW)).toMatchObject({ label: 'Today', tone: 'today', relative: null })
    expect(formatDueDate(addDays(TODAY, 1), NOW)).toMatchObject({ label: 'Tomorrow', tone: 'soon' })
    expect(formatDueDate(addDays(TODAY, -1), NOW)).toMatchObject({ label: 'Yesterday', tone: 'overdue' })
  })

  it('uses a weekday within the coming week and a full date beyond it', () => {
    expect(formatDueDate(addDays(TODAY, 3), NOW)).toMatchObject({ tone: 'soon', label: 'Sun' })
    expect(formatDueDate(addDays(TODAY, 40), NOW)).toMatchObject({ tone: 'upcoming' })
  })

  it('marks past dates overdue and describes the gap', () => {
    const result = formatDueDate(addDays(TODAY, -5), NOW)
    expect(result?.tone).toBe('overdue')
    expect(result?.relative).toBe('5 days ago')
  })

  it('returns null for an invalid date instead of rendering nonsense', () => {
    expect(formatDueDate('2026-02-30', NOW)).toBeNull()
  })
})

describe('isOverdue', () => {
  it('is true only for unfinished tasks whose date has passed', () => {
    expect(isOverdue(addDays(TODAY, -1), false, NOW)).toBe(true)
    expect(isOverdue(addDays(TODAY, -1), true, NOW)).toBe(false) // completed
    expect(isOverdue(TODAY, false, NOW)).toBe(false) // due today is not late
    expect(isOverdue(addDays(TODAY, 1), false, NOW)).toBe(false)
    expect(isOverdue(null, false, NOW)).toBe(false)
  })
})

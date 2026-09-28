/**
 * The `cn` class-name joiner.
 *
 * Deliberately not a dependency: this is the entire feature set we need
 * (conditional joining plus Tailwind conflict resolution via `tailwind-merge`).
 */

export type ClassValue = string | number | null | false | undefined | ClassValue[]

export function cn(...values: ClassValue[]): string {
  const out: string[] = []
  for (const value of values) {
    if (!value) continue
    if (Array.isArray(value)) {
      const nested = cn(...value)
      if (nested) out.push(nested)
    } else {
      out.push(String(value))
    }
  }
  return out.join(' ')
}

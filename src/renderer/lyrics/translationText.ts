import type { LyricLine } from '../../shared/lyrics'

/**
 * Returns the non-empty translation text attached to a line under `key`, or null.
 * Translation text is always plain line-level text; it is never split into words.
 */
export function translationTextForLine(line: LyricLine, key: string | null): string | null {
  if (!key) return null

  const text = line.translations?.[key]
  if (typeof text !== 'string') return null
  return text.trim() === '' ? null : text
}

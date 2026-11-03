import type { LyricSegment } from '../../shared/lyrics'

/** Consecutive segments that form one unbreakable word. */
export interface LyricWordGroup {
  segments: LyricSegment[]
  /** True when the group ended with a segment that had trailing whitespace. */
  spaceAfter: boolean
}

/**
 * Splits a line's segments into nowrap word containers. A segment with `spaceAfter` closes the
 * current word, so the renderer can put a single space between containers.
 */
export function groupSegments(segments: readonly LyricSegment[]): LyricWordGroup[] {
  const groups: LyricWordGroup[] = []
  let current: LyricSegment[] = []

  for (const segment of segments) {
    current.push(segment)

    if (segment.spaceAfter) {
      groups.push({ segments: current, spaceAfter: true })
      current = []
    }
  }

  if (current.length > 0) groups.push({ segments: current, spaceAfter: false })
  return groups
}

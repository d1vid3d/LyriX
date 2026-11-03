import type { LyricDocument, LyricLine, LyricSegment } from './types'

function progressBetween(start: number, end: number, time: number): number {
  if (!Number.isFinite(time) || time <= start) return 0
  if (time >= end) return 1
  return (time - start) / (end - start)
}

/** Last line whose start is at or before t; stays on that line through instrumental gaps. */
export function findActiveLineIndex(doc: LyricDocument, time: number): number {
  if (!doc.timed || doc.lines.length === 0 || !Number.isFinite(time)) return -1

  const lines = doc.lines
  let low = 0
  let high = lines.length - 1
  let result = -1

  while (low <= high) {
    const middle = (low + high) >> 1
    if (lines[middle].start <= time) {
      result = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return result
}

/** Every line containing t, which also covers overlapping lines. */
export function findActiveLineIndexes(doc: LyricDocument, time: number): number[] {
  if (!doc.timed || !Number.isFinite(time)) return []

  const active: number[] = []
  for (let index = 0; index < doc.lines.length; index += 1) {
    const line = doc.lines[index]
    if (line.start <= time && time < line.end) active.push(index)
  }
  return active
}

export function findActiveSegmentIndex(line: LyricLine, time: number): number {
  if (!line.segments || line.segments.length === 0 || !Number.isFinite(time)) return -1

  let result = -1
  for (let index = 0; index < line.segments.length; index += 1) {
    if (line.segments[index].start <= time) result = index
    else break
  }
  return result
}

export function segmentProgress(segment: LyricSegment, time: number): number {
  return progressBetween(segment.start, segment.end, time)
}

export function lineProgress(line: LyricLine, time: number): number {
  return progressBetween(line.start, line.end, time)
}

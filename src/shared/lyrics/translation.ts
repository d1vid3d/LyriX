import type { LyricDocument } from './types'

export type AlignmentMethod = 'time' | 'index' | 'partial' | 'none'

export interface AlignmentReport {
  method: AlignmentMethod
  /** Non-blank primary lines that received a non-blank translation. */
  matched: number
  /** Non-blank primary lines. */
  total: number
  /** Translation lines not consumed by matching. */
  unmatchedTranslationLines: number
}

export interface AlignTranslationOptions {
  /** Maximum absolute start-time difference for a time match (default 0.5). */
  toleranceSeconds?: number
  /** Minimum matched/total ratio for the time method (default 0.8). */
  minTimeMatchRatio?: number
}

export interface AlignedTranslation {
  /** One entry per primary line, by array index. */
  lines: Array<string | null>
  report: AlignmentReport
}

const DEFAULT_TOLERANCE_SECONDS = 0.5
const DEFAULT_MIN_TIME_MATCH_RATIO = 0.8
const BLANK_CHARACTERS = /[\s♪♫♬♩\p{P}]/gu

/** Empty, whitespace-only, music-note-only, or punctuation-only text is blank. */
export function isBlankLyricText(text: string): boolean {
  return text.replace(BLANK_CHARACTERS, '') === ''
}

/**
 * Matches translation lines to primary lines. Time matching is greedy in primary order and
 * one-to-one; equal line counts fall back to index pairing when time matching is weak.
 */
export function alignTranslation(
  primary: LyricDocument,
  translation: LyricDocument,
  options: AlignTranslationOptions = {}
): AlignedTranslation {
  const tolerance = resolveTolerance(options.toleranceSeconds)
  const minRatio = resolveRatio(options.minTimeMatchRatio)
  const total = primary.lines.filter((line) => !isBlankLyricText(line.text)).length

  const timeLines: Array<string | null> = Array.from(
    { length: primary.lines.length },
    () => null
  )
  const usedTranslation = new Set<number>()
  let timeMatched = 0

  if (primary.timed && translation.timed) {
    for (let primaryIndex = 0; primaryIndex < primary.lines.length; primaryIndex += 1) {
      const primaryLine = primary.lines[primaryIndex]
      if (!primaryLine || isBlankLyricText(primaryLine.text)) continue

      const matchIndex = findClosestTranslation(primaryLine.start, translation, usedTranslation, tolerance)
      if (matchIndex === -1) continue

      usedTranslation.add(matchIndex)
      const translationLine = translation.lines[matchIndex]
      const text = translationLine && !isBlankLyricText(translationLine.text) ? translationLine.text : null
      timeLines[primaryIndex] = text
      if (text !== null) timeMatched += 1
    }
  }

  const ratio = total === 0 ? 0 : timeMatched / total
  if (primary.timed && translation.timed && ratio >= minRatio) {
    return {
      lines: timeLines,
      report: {
        method: 'time',
        matched: timeMatched,
        total,
        unmatchedTranslationLines: translation.lines.length - usedTranslation.size
      }
    }
  }

  if (primary.lines.length === translation.lines.length) {
    const lines = primary.lines.map((line, index) => {
      if (isBlankLyricText(line.text)) return null
      const candidate = translation.lines[index]
      return candidate && !isBlankLyricText(candidate.text) ? candidate.text : null
    })

    return {
      lines,
      report: {
        method: 'index',
        matched: lines.filter((line) => line !== null).length,
        total,
        unmatchedTranslationLines: 0
      }
    }
  }

  const method: AlignmentMethod = timeMatched > 0 ? 'partial' : 'none'
  return {
    lines: timeLines,
    report: {
      method,
      matched: timeMatched,
      total,
      unmatchedTranslationLines: translation.lines.length - usedTranslation.size
    }
  }
}

/**
 * Returns a new document with `translations[key] = text` on lines whose entry is non-null.
 * Times, segments, and agents are copied untouched; the input is never mutated.
 */
export function attachTranslation(
  primary: LyricDocument,
  key: string,
  lines: readonly (string | null)[]
): LyricDocument {
  return {
    ...primary,
    lines: primary.lines.map((line, index) => {
      const text = lines[index]
      if (text === null || text === undefined) return { ...line }

      return {
        ...line,
        translations: { ...(line.translations ?? {}), [key]: text }
      }
    })
  }
}

function findClosestTranslation(
  start: number,
  translation: LyricDocument,
  used: ReadonlySet<number>,
  tolerance: number
): number {
  let bestIndex = -1
  let bestDifference = Number.POSITIVE_INFINITY

  for (let index = 0; index < translation.lines.length; index += 1) {
    if (used.has(index)) continue
    const line = translation.lines[index]
    if (!line || !Number.isFinite(line.start)) continue

    const difference = Math.abs(start - line.start)
    if (difference > tolerance) continue

    // Ties keep the lowest translation index because the loop runs ascending.
    if (difference < bestDifference) {
      bestIndex = index
      bestDifference = difference
    }
  }

  return bestIndex
}

function resolveTolerance(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_TOLERANCE_SECONDS
}

function resolveRatio(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MIN_TIME_MATCH_RATIO
  return Math.min(1, Math.max(0, value))
}

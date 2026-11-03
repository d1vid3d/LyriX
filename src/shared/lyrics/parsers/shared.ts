import type {
  LyricDocument,
  LyricFormat,
  LyricLine,
  LyricMetadata,
  LyricSegment,
  ResolvedLyricParseOptions
} from '../types'
import { parseOffsetMs } from '../time'

const HEADER_TAG_RE = /^\[([A-Za-z]+):(.*)\]$/

export interface DraftSegment {
  text: string
  start: number
  spaceAfter: boolean
}

/** A parsed line before ends, sorting and indexes are finalized. */
export interface DraftLine {
  start: number
  text: string
  order: number
  agent?: string
  segments?: DraftSegment[]
  explicitEnd?: number
}

interface ExtractedSource {
  metadata: LyricMetadata
  body: string[]
  warnings: string[]
}

function lastTagValue(raw: Record<string, string>, tag: string): string | undefined {
  let value: string | undefined
  for (const [key, tagValue] of Object.entries(raw)) {
    if (key.toLowerCase() === tag) value = tagValue
  }
  return value
}

/**
 * Splits header tags from body lines. Tags are recognized anywhere and use a letters-only
 * key, so timed lines such as [00:10.00] never match.
 */
export function extractHeaders(text: string): ExtractedSource {
  const raw: Record<string, string> = {}
  const body: string[] = []
  const warnings: string[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue

    const match = HEADER_TAG_RE.exec(trimmed)
    if (!match) {
      body.push(line)
      continue
    }

    raw[match[1]] = match[2].trim()
  }

  const metadata: LyricMetadata = { raw }
  const title = lastTagValue(raw, 'ti')
  const artist = lastTagValue(raw, 'ar')
  const album = lastTagValue(raw, 'al')
  const author = lastTagValue(raw, 'by')
  const offset = lastTagValue(raw, 'offset')

  if (title !== undefined) metadata.title = title
  if (artist !== undefined) metadata.artist = artist
  if (album !== undefined) metadata.album = album
  if (author !== undefined) metadata.author = author

  if (offset !== undefined) {
    const offsetMs = parseOffsetMs(offset)
    if (offsetMs === null) {
      warnings.push(`Invalid offset tag "${offset}" ignored.`)
    } else {
      metadata.offsetMs = offsetMs
    }
  }

  return { metadata, body, warnings }
}

export function describeLine(line: string): string {
  const compact = line.trim().replace(/\s+/g, ' ')
  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact
}

function withOffset(lines: LyricLine[], offsetMs: number): void {
  const delta = offsetMs / 1000
  for (const line of lines) {
    line.start -= delta
    line.end -= delta
    for (const segment of line.segments ?? []) {
      segment.start -= delta
      segment.end -= delta
    }
  }
}

export function finalizeTimedLines(
  drafts: readonly DraftLine[],
  options: ResolvedLyricParseOptions
): LyricLine[] {
  const sorted = [...drafts].sort((a, b) => a.start - b.start || a.order - b.order)
  const lines: LyricLine[] = []

  for (let index = 0; index < sorted.length; index += 1) {
    const draft = sorted[index]
    let end: number
    let endIsEstimated: boolean

    if (draft.explicitEnd !== undefined) {
      end = draft.explicitEnd
      endIsEstimated = false
    } else {
      const next = sorted[index + 1]
      end = next
        ? Math.min(next.start, draft.start + options.maxEstimatedLineSeconds)
        : draft.start + options.lastLineSeconds
      endIsEstimated = true
    }

    const line: LyricLine = {
      index,
      start: draft.start,
      end,
      endIsEstimated,
      text: draft.text
    }

    if (draft.agent !== undefined) line.agent = draft.agent

    if (draft.segments !== undefined && draft.segments.length > 0) {
      line.segments = draft.segments.map(
        (segment, segmentIndex): LyricSegment => ({
          text: segment.text,
          start: segment.start,
          end:
            segmentIndex + 1 < draft.segments!.length
              ? draft.segments![segmentIndex + 1].start
              : end,
          spaceAfter: segment.spaceAfter
        })
      )
    }

    lines.push(line)
  }

  return lines
}

export function buildTimedDocument(
  format: LyricFormat,
  metadata: LyricMetadata,
  warnings: string[],
  drafts: DraftLine[],
  options: ResolvedLyricParseOptions
): LyricDocument {
  const lines = finalizeTimedLines(drafts, options)
  if (options.applyOffset && metadata.offsetMs !== undefined) {
    withOffset(lines, metadata.offsetMs)
  }

  return { format, timed: true, metadata, lines, warnings }
}

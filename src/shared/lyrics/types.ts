export type LyricFormat = 'plain' | 'lrc' | 'enhanced-lrc'

export interface LyricSegment {
  /** Segment text without trailing whitespace. */
  text: string
  /** Seconds. */
  start: number
  /** Seconds. */
  end: number
  /** False when the next segment continues the same word. */
  spaceAfter: boolean
}

export interface LyricLine {
  index: number
  /** Seconds. */
  start: number
  /** Seconds. */
  end: number
  /** True when the end was derived rather than read from the file. */
  endIsEstimated: boolean
  /** Full line text without timestamps or singer prefix. */
  text: string
  /** Present only for word-timed lines. */
  segments?: LyricSegment[]
  /** Singer label as written, e.g. "v1". */
  agent?: string
  /** Reserved for translations; not parsed yet. */
  translations?: Record<string, string>
}

export interface LyricMetadata {
  title?: string
  artist?: string
  album?: string
  author?: string
  offsetMs?: number
  /** Every header tag as written. */
  raw: Record<string, string>
}

export interface LyricDocument {
  format: LyricFormat
  /** False for plain untimed text. */
  timed: boolean
  metadata: LyricMetadata
  /** Sorted by start, stable. */
  lines: LyricLine[]
  /** Human-readable notes about skipped or odd input. */
  warnings: string[]
}

export interface LyricParseOptions {
  /** Subtract metadata.offsetMs from every timestamp (default true). */
  applyOffset?: boolean
  /** Cap for estimated line ends derived from the next line (default 10). */
  maxEstimatedLineSeconds?: number
  /** Duration of the final line when its end is unknown (default 5). */
  lastLineSeconds?: number
}

export type ResolvedLyricParseOptions = Required<LyricParseOptions>

/** One entry in the format registry. */
export interface LyricParser {
  id: LyricFormat
  detect(text: string): boolean
  parse(text: string, options: ResolvedLyricParseOptions): LyricDocument
}

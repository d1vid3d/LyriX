import type {
  LyricDocument,
  LyricFormat,
  LyricParseOptions,
  LyricParser,
  ResolvedLyricParseOptions
} from './types'
import { enhancedLrcParser } from './parsers/enhanced-lrc'
import { lrcParser } from './parsers/lrc'
import { plainParser } from './parsers/plain'

const DEFAULT_OPTIONS: ResolvedLyricParseOptions = {
  applyOffset: true,
  maxEstimatedLineSeconds: 10,
  lastLineSeconds: 5
}

// Detection order matters: enhanced LRC is line-timed plus word markers, and plain is the
// fallback that always matches.
const PARSERS: readonly LyricParser[] = [enhancedLrcParser, lrcParser, plainParser]

function normalizeSource(text: string): string {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return withoutBom.replace(/\r\n?/g, '\n')
}

function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function resolveOptions(options?: LyricParseOptions): ResolvedLyricParseOptions {
  return {
    applyOffset: options?.applyOffset ?? DEFAULT_OPTIONS.applyOffset,
    maxEstimatedLineSeconds: positiveOr(
      options?.maxEstimatedLineSeconds,
      DEFAULT_OPTIONS.maxEstimatedLineSeconds
    ),
    lastLineSeconds: positiveOr(options?.lastLineSeconds, DEFAULT_OPTIONS.lastLineSeconds)
  }
}

function selectParser(text: string): LyricParser {
  return PARSERS.find((parser) => parser.detect(text)) ?? plainParser
}

export function detectLyricFormat(text: string): LyricFormat {
  return selectParser(normalizeSource(text)).id
}

/** Parses lyric text without touching the DOM, filesystem or Electron APIs. */
export function parseLyrics(text: string, options?: LyricParseOptions): LyricDocument {
  const normalized = normalizeSource(text)
  return selectParser(normalized).parse(normalized, resolveOptions(options))
}

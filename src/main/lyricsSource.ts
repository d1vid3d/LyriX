import { parseFile } from 'music-metadata'
import type { LyricsResult } from '../shared/types'

/** The main process resolves the file path; resolvers never receive renderer input. */
export interface LyricsTrack {
  id: string
  filePath: string
}

export type LyricResolver = (track: LyricsTrack) => Promise<LyricsResult | null>

const LYRICS_TAG_IDS = new Set(['lyrics', 'unsyncedlyrics'])
const LINE_TIMESTAMP_RE = /^\s*\[\d+:\d{1,2}(?:\.\d+)?\]/m

/**
 * Resolvers run in order and the first non-empty result wins. A sidecar `.lrc` resolver can be
 * inserted here without changing the IPC or renderer.
 */
const RESOLVERS: readonly LyricResolver[] = [embeddedResolver]

export async function resolveLyrics(track: LyricsTrack): Promise<LyricsResult | null> {
  for (const resolver of RESOLVERS) {
    try {
      const result = await resolver(track)
      if (result && result.text.trim() !== '') {
        console.debug(`[lyrics] ${track.id} loaded from ${result.source}`)
        return result
      }
    } catch (error) {
      console.warn(`[lyrics] ${resolver.name || 'resolver'} failed for ${track.id}`, error)
    }
  }

  return null
}

async function embeddedResolver(track: LyricsTrack): Promise<LyricsResult | null> {
  const metadata = await parseFile(track.filePath, { duration: false, skipCovers: true })

  const common = extractCommonLyrics(metadata.common.lyrics)
  if (common) return { text: common, source: 'common.lyrics' }

  return extractNativeLyrics(metadata.native)
}

function extractCommonLyrics(value: unknown): string | null {
  const entries = Array.isArray(value) ? value : [value]

  for (const entry of entries) {
    const text = extractLyricEntry(entry)
    if (text) return text
  }

  return null
}

/** Handles strings, `{ text }` objects and `{ syncText }` objects from different tag types. */
function extractLyricEntry(entry: unknown): string | null {
  if (typeof entry === 'string') return entry.trim()

  if (!entry || typeof entry !== 'object') return null

  const record = entry as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text.trim() : ''
  const syncText = reconstructSyncText(record.syncText)

  // music-metadata strips timestamps from common.lyrics text but keeps them in syncText.
  if (syncText && !LINE_TIMESTAMP_RE.test(text)) return syncText
  if (text) return text
  if (syncText) return syncText

  return extractTagValue(record.value)
}

function extractNativeLyrics(native: unknown): LyricsResult | null {
  if (!native || typeof native !== 'object') return null

  for (const [tagType, tags] of Object.entries(native as Record<string, unknown>)) {
    if (!Array.isArray(tags)) continue

    for (const tag of tags) {
      if (!tag || typeof tag !== 'object') continue

      const record = tag as Record<string, unknown>
      const id = typeof record.id === 'string' ? record.id : ''
      if (!LYRICS_TAG_IDS.has(id.toLowerCase())) continue

      const text = extractTagValue(record.value)
      if (text) return { text, source: `${tagType}:${id}` }
    }
  }

  return null
}

function extractTagValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim()

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractTagValue(item)
      if (text) return text
    }
    return null
  }

  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text.trim() : ''
  const syncText = reconstructSyncText(record.syncText)

  if (syncText && !LINE_TIMESTAMP_RE.test(text)) return syncText
  if (text) return text
  if (syncText) return syncText

  return null
}

/** Turns music-metadata's millisecond sync entries back into line-timed LRC. */
function reconstructSyncText(value: unknown): string | null {
  if (!Array.isArray(value)) return null

  const lines: string[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue

    const record = item as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    const timestamp = typeof record.timestamp === 'number' ? record.timestamp : Number.NaN
    if (text === '' || !Number.isFinite(timestamp)) continue

    lines.push(`${formatLrcTimestamp(timestamp)}${text}`)
  }

  return lines.length > 0 ? lines.join('\n') : null
}

function formatLrcTimestamp(milliseconds: number): string {
  const hundredths = Math.max(0, Math.round(milliseconds / 10))
  const minutes = Math.floor(hundredths / 6000)
  const seconds = Math.floor((hundredths % 6000) / 100)
  const fraction = hundredths % 100
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}]`
}

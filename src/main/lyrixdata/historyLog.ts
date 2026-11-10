import type { HistoryItem } from '../../shared/types'
import { isValidRefPath } from './formats'
import type { TrackRefIndex } from './trackRef'
import { resolveTrackRef } from './trackRef'
import type { TrackRef } from './trackRef'

export const HISTORY_READ_BYTES = 10 * 1024 * 1024
export const HISTORY_DEFAULT_LIMIT = 500
export const HISTORY_MAX_LIMIT = 5000
export const HISTORY_DOUBLE_COUNT_MS = 5000

export interface HistoryRecord {
  v: 1
  ref: TrackRef
  at: number
  m: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidTrackRef(value: unknown): value is TrackRef {
  if (!isRecord(value) || !isValidRefPath(value.path)) return false
  const fp = value.fp
  if (!isRecord(fp)) return false
  return (
    typeof fp.title === 'string' &&
    typeof fp.artist === 'string' &&
    typeof fp.album === 'string' &&
    typeof fp.durationSec === 'number' &&
    Number.isFinite(fp.durationSec)
  )
}

export function serializeHistoryRecord(record: HistoryRecord): string {
  return JSON.stringify(record)
}

/**
 * Tolerant JSONL parse. Unknown versions and malformed lines are skipped (and never deleted);
 * a partial trailing line without `\n` is ignored so a crash cannot break reading.
 */
export function parseHistoryText(text: string): HistoryRecord[] {
  if (text === '') return []

  const lines = text.split('\n')
  if (!text.endsWith('\n')) lines.pop()

  const records: HistoryRecord[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') continue

    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (!isRecord(parsed) || parsed.v !== 1) continue
      if (!isValidTrackRef(parsed.ref)) continue
      if (typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) continue
      if (typeof parsed.m !== 'string') continue
      records.push({ v: 1, ref: parsed.ref, at: parsed.at, m: parsed.m })
    } catch {
      // Skip malformed lines.
    }
  }
  return records
}

/** Aggregates resolved records by track id, dropping missing refs; newest first. */
export function aggregateHistory(
  records: readonly HistoryRecord[],
  index: TrackRefIndex,
  limit = HISTORY_DEFAULT_LIMIT
): HistoryItem[] {
  const byTrack = new Map<string, HistoryItem>()

  for (const record of records) {
    const resolution = resolveTrackRef(record.ref, index)
    if (resolution.status === 'missing') continue

    const trackId = resolution.track.id
    const existing = byTrack.get(trackId)
    if (existing) {
      existing.lastPlayedAt = Math.max(existing.lastPlayedAt, record.at)
      existing.playCount += 1
    } else {
      byTrack.set(trackId, {
        trackId,
        lastPlayedAt: record.at,
        playCount: 1
      })
    }
  }

  const bounded = Math.max(1, Math.min(Math.trunc(limit), HISTORY_MAX_LIMIT))
  return [...byTrack.values()]
    .sort(
      (a, b) =>
        b.lastPlayedAt - a.lastPlayedAt ||
        b.playCount - a.playCount ||
        a.trackId.localeCompare(b.trackId)
    )
    .slice(0, bounded)
}

/** Resolves the final record's track id for the 5 s double-count guard. */
export function lastResolvedTrackId(
  records: readonly HistoryRecord[],
  index: TrackRefIndex
): string | null {
  for (let position = records.length - 1; position >= 0; position -= 1) {
    const resolution = resolveTrackRef(records[position].ref, index)
    if (resolution.status !== 'missing') return resolution.track.id
  }
  return null
}

import type {
  QueueContext,
  QueueOrigin,
  RestoredSession,
  SessionPositionState,
  SessionQueueEntry,
  SessionQueueState
} from '../shared/types'
import { isValidTrackId } from './lyrics/choices'

export const SESSION_VERSION = 1
export const SESSION_ENTRY_LIMIT = 50_000
export const SESSION_ID_LIMIT = 128
export const SESSION_LABEL_LIMIT = 200

const CONTEXT_KINDS: ReadonlySet<string> = new Set([
  'album',
  'artist',
  'tracks',
  'search',
  'favorites',
  'other'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= SESSION_ID_LIMIT
    ? value
    : null
}

function normalizeOrigin(value: unknown): QueueOrigin {
  return value === 'playNext' || value === 'added' ? value : 'context'
}

function normalizeContext(value: unknown): QueueContext | null {
  if (!isRecord(value) || typeof value.kind !== 'string' || !CONTEXT_KINDS.has(value.kind)) {
    return null
  }
  if (typeof value.label !== 'string' || value.label.length > SESSION_LABEL_LIMIT) return null
  return { kind: value.kind as QueueContext['kind'], label: value.label }
}

/**
 * Validates a renderer-supplied queue payload. Entries are capped, ids bounded, track ids must be
 * the SHA-1 shape, and duplicate entry ids are dropped. Never accepts paths.
 */
export function normalizeSessionQueue(value: unknown): SessionQueueState | null {
  if (!isRecord(value) || value.version !== SESSION_VERSION) return null
  if (!Array.isArray(value.entries)) return null

  const entries: SessionQueueEntry[] = []
  const seen = new Set<string>()
  for (const raw of value.entries.slice(0, SESSION_ENTRY_LIMIT)) {
    if (!isRecord(raw)) continue
    const entryId = boundedId(raw.entryId)
    if (!entryId || seen.has(entryId) || !isValidTrackId(raw.trackId)) continue
    seen.add(entryId)
    entries.push({ entryId, trackId: raw.trackId, origin: normalizeOrigin(raw.origin) })
  }

  const originalOrder: string[] = []
  if (Array.isArray(value.originalOrder)) {
    for (const raw of value.originalOrder.slice(0, SESSION_ENTRY_LIMIT)) {
      const id = boundedId(raw)
      if (id && seen.has(id) && !originalOrder.includes(id)) originalOrder.push(id)
    }
  }

  const currentCandidate = boundedId(value.currentEntryId)
  const currentEntryId =
    currentCandidate && entries.some((entry) => entry.entryId === currentCandidate)
      ? currentCandidate
      : null

  return {
    version: SESSION_VERSION,
    entries,
    originalOrder,
    currentEntryId,
    context: normalizeContext(value.context)
  }
}

/** Validates the tiny position payload; position must be finite and non-negative. */
export function normalizeSessionPosition(value: unknown): SessionPositionState | null {
  if (!isRecord(value)) return null
  const entryId = boundedId(value.entryId)
  if (!entryId || !isValidTrackId(value.trackId)) return null
  if (typeof value.position !== 'number' || !Number.isFinite(value.position)) return null
  if (value.position < 0) return null

  return {
    entryId,
    trackId: value.trackId,
    position: Math.round(value.position * 1000) / 1000
  }
}

/**
 * Combines the two stored files and drops a position that no longer matches its entry, so a
 * position can never apply to the wrong track.
 */
export function normalizeRestoredSession(
  queue: unknown,
  position: unknown
): RestoredSession | null {
  const normalizedQueue = normalizeSessionQueue(queue)
  if (!normalizedQueue) return null

  const normalizedPosition = normalizeSessionPosition(position)
  const matches =
    normalizedPosition !== null &&
    normalizedQueue.entries.some(
      (entry) =>
        entry.entryId === normalizedPosition.entryId && entry.trackId === normalizedPosition.trackId
    )

  return {
    queue: normalizedQueue,
    position: matches ? normalizedPosition : null
  }
}

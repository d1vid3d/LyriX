import { describe, expect, it } from 'vitest'
import {
  normalizeRestoredSession,
  normalizeSessionPosition,
  normalizeSessionQueue,
  SESSION_ENTRY_LIMIT,
  SESSION_LABEL_LIMIT
} from '../src/main/sessionValidation'

const trackA = 'a'.repeat(40)
const trackB = 'b'.repeat(40)

function queueState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    entries: [
      { entryId: 'entry-1', trackId: trackA, origin: 'context' },
      { entryId: 'entry-2', trackId: trackB, origin: 'playNext' }
    ],
    originalOrder: ['entry-1', 'entry-2'],
    currentEntryId: 'entry-1',
    context: { kind: 'album', label: 'Album' },
    ...overrides
  }
}

describe('normalizeSessionQueue', () => {
  it('accepts a valid payload', () => {
    const result = normalizeSessionQueue(queueState())
    expect(result).toEqual({
      version: 1,
      entries: [
        { entryId: 'entry-1', trackId: trackA, origin: 'context' },
        { entryId: 'entry-2', trackId: trackB, origin: 'playNext' }
      ],
      originalOrder: ['entry-1', 'entry-2'],
      currentEntryId: 'entry-1',
      context: { kind: 'album', label: 'Album' }
    })
  })

  it('rejects the wrong version or missing entries', () => {
    expect(normalizeSessionQueue({ ...queueState(), version: 2 })).toBeNull()
    expect(normalizeSessionQueue({ version: 1 })).toBeNull()
    expect(normalizeSessionQueue(null)).toBeNull()
  })

  it('drops invalid ids, duplicate entry ids, and invalid track ids', () => {
    const result = normalizeSessionQueue(
      queueState({
        entries: [
          { entryId: 'entry-1', trackId: trackA, origin: 'context' },
          { entryId: 'entry-1', trackId: trackB, origin: 'context' },
          { entryId: 'x'.repeat(129), trackId: trackB, origin: 'context' },
          { entryId: 'entry-3', trackId: '../etc/passwd', origin: 'context' },
          { entryId: 'entry-4', trackId: trackB, origin: 'unknown' }
        ]
      })
    )

    expect(result?.entries).toEqual([
      { entryId: 'entry-1', trackId: trackA, origin: 'context' },
      { entryId: 'entry-4', trackId: trackB, origin: 'context' }
    ])
  })

  it('caps entries and drops a current entry that is not present', () => {
    const entries = Array.from({ length: SESSION_ENTRY_LIMIT + 5 }, (_, index) => ({
      entryId: `entry-${index}`,
      trackId: trackA,
      origin: 'context'
    }))
    const result = normalizeSessionQueue(
      queueState({ entries, currentEntryId: 'missing', originalOrder: ['missing'] })
    )
    expect(result?.entries).toHaveLength(SESSION_ENTRY_LIMIT)
    expect(result?.currentEntryId).toBeNull()
    expect(result?.originalOrder).toEqual([])
  })

  it('normalizes an unknown origin and an oversized context', () => {
    const result = normalizeSessionQueue(
      queueState({
        entries: [{ entryId: 'entry-1', trackId: trackA, origin: 'bogus' }],
        originalOrder: [],
        currentEntryId: null,
        context: { kind: 'album', label: 'x'.repeat(SESSION_LABEL_LIMIT + 1) }
      })
    )
    expect(result?.entries[0]?.origin).toBe('context')
    expect(result?.context).toBeNull()
  })
})

describe('normalizeSessionPosition', () => {
  it('accepts finite non-negative positions and rounds to milliseconds', () => {
    expect(
      normalizeSessionPosition({ entryId: 'entry-1', trackId: trackA, position: 12.34567 })
    ).toEqual({ entryId: 'entry-1', trackId: trackA, position: 12.346 })
  })

  it('rejects invalid positions', () => {
    for (const position of [-1, Number.NaN, Number.POSITIVE_INFINITY, '12', null]) {
      expect(
        normalizeSessionPosition({ entryId: 'entry-1', trackId: trackA, position })
      ).toBeNull()
    }
    expect(normalizeSessionPosition({ entryId: '', trackId: trackA, position: 1 })).toBeNull()
    expect(normalizeSessionPosition({ entryId: 'entry-1', trackId: 'bad', position: 1 })).toBeNull()
  })
})

describe('normalizeRestoredSession', () => {
  it('keeps a position that matches its queue entry', () => {
    const result = normalizeRestoredSession(queueState(), {
      entryId: 'entry-1',
      trackId: trackA,
      position: 42
    })
    expect(result?.position?.position).toBe(42)
  })

  it('drops a position that points at another entry or track', () => {
    expect(
      normalizeRestoredSession(queueState(), {
        entryId: 'entry-2',
        trackId: trackA,
        position: 42
      })?.position
    ).toBeNull()
    expect(
      normalizeRestoredSession(queueState(), {
        entryId: 'entry-1',
        trackId: trackB,
        position: 42
      })?.position
    ).toBeNull()
  })
})

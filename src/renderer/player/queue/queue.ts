import type { Track } from '../../../shared/types'
import type { QueueContext, SessionQueueState } from '../../../shared/types'
import { shuffleArray, shuffleEntriesAvoidingTrack } from './shuffle'
import type { QueueRandom } from './shuffle'
import type {
  QueueEntry,
  QueueOrigin,
  QueueSnapshot,
  RepeatMode
} from './types'

export interface SetQueueOptions {
  context?: QueueContext | null
}

export type QueueListener = (snapshot: QueueSnapshot) => void

interface QueueOptions {
  random?: QueueRandom
}

/** Matches the main-process session cap so a hostile payload cannot build a huge queue. */
const IMPORT_ENTRY_LIMIT = 50_000
const CONTEXT_KINDS: ReadonlySet<string> = new Set([
  'album',
  'artist',
  'tracks',
  'search',
  'favorites',
  'other'
])

function clampIndex(value: number, length: number): number {
  const requested = Number.isFinite(value) ? Math.trunc(value) : 0
  return Math.min(Math.max(requested, 0), length - 1)
}

function normalizeRepeat(mode: RepeatMode): RepeatMode {
  return mode === 'all' || mode === 'one' ? mode : 'off'
}

/** Editable play-order queue with shuffle and repeat. No playback or DOM concerns. */
export class PlaybackQueue {
  private entries: QueueEntry[] = []
  private originalOrder: string[] = []
  private index = -1
  private shuffle = false
  private repeat: RepeatMode = 'off'
  private context: QueueContext | null = null
  private version = 0
  private entryCounter = 0
  private cachedSnapshot: QueueSnapshot | null = null
  private pendingWrapOrder: QueueEntry[] | null = null
  private readonly listeners = new Set<QueueListener>()
  private readonly random: QueueRandom

  constructor(options: QueueOptions | QueueRandom = {}) {
    this.random = typeof options === 'function' ? options : options.random ?? Math.random
  }

  getSnapshot(): QueueSnapshot {
    if (this.cachedSnapshot) return this.cachedSnapshot

    const entries = this.entries.map((entry) =>
      Object.freeze({
        entryId: entry.entryId,
        track: entry.track,
        origin: entry.origin
      })
    )
    const current = this.index >= 0 ? entries[this.index] ?? null : null

    this.cachedSnapshot = Object.freeze({
      entries: Object.freeze(entries),
      currentIndex: current ? this.index : -1,
      current,
      shuffle: this.shuffle,
      repeat: this.repeat,
      context: this.context ? Object.freeze({ ...this.context }) : null,
      version: this.version
    })
    return this.cachedSnapshot
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setQueue(
    tracks: readonly Track[],
    startIndex = 0,
    options: SetQueueOptions = {}
  ): QueueEntry | null {
    const entries = tracks.map((track) => this.createEntry(track, 'context'))
    this.originalOrder = entries.map((entry) => entry.entryId)
    this.context = options.context ?? null

    if (entries.length === 0) {
      this.entries = []
      this.index = -1
      this.commit()
      return null
    }

    const start = clampIndex(startIndex, entries.length)

    if (this.shuffle) {
      const startEntry = entries[start]
      const remaining = entries.filter((_, index) => index !== start)
      this.entries = [startEntry, ...shuffleArray(remaining, this.random)]
      this.index = 0
    } else {
      this.entries = entries
      this.index = start
    }

    this.commit()
    return this.currentEntry()
  }

  advance(reason: 'ended' | 'skip'): QueueEntry | null {
    const current = this.currentEntry()
    if (!current) return null

    if (this.repeat === 'one' && reason === 'ended') return current

    if (this.index < this.entries.length - 1) {
      this.index += 1
      this.commit()
      return this.currentEntry()
    }

    if (this.repeat === 'all') {
      if (this.shuffle) {
        this.entries =
          this.pendingWrapOrder ??
          shuffleEntriesAvoidingTrack(this.entries, this.random, current.track.id)
      }
      this.index = 0
      this.commit()
      return this.currentEntry()
    }

    return null
  }

  peekNext(reason: 'ended' | 'skip'): QueueEntry | null {
    const current = this.currentEntry()
    if (!current) return null

    if (this.repeat === 'one' && reason === 'ended') return current

    if (this.index < this.entries.length - 1) {
      return this.entries[this.index + 1] ?? null
    }

    if (this.repeat !== 'all') return null
    if (!this.shuffle) return this.entries[0] ?? null

    if (!this.pendingWrapOrder) {
      this.pendingWrapOrder = shuffleEntriesAvoidingTrack(
        this.entries,
        this.random,
        current.track.id
      )
    }
    return this.pendingWrapOrder[0] ?? null
  }

  previous(): QueueEntry | null {
    if (this.entries.length === 0 || this.index < 0) return null

    if (this.index > 0) {
      this.index -= 1
      this.commit()
      return this.currentEntry()
    }

    if (this.repeat === 'all') {
      this.index = this.entries.length - 1
      this.commit()
      return this.currentEntry()
    }

    return null
  }

  canGoNext(): boolean {
    if (this.index < 0) return false
    return (
      this.index < this.entries.length - 1 ||
      (this.repeat === 'all' && this.entries.length > 0)
    )
  }

  canGoPrevious(): boolean {
    return this.entries.length > 0
  }

  playNext(tracks: readonly Track[]): QueueEntry[] {
    if (tracks.length === 0) return []

    const inserted = tracks.map((track) => this.createEntry(track, 'playNext'))
    const current = this.currentEntry()

    if (!current) {
      this.entries.push(...inserted)
      this.originalOrder.push(...inserted.map((entry) => entry.entryId))
      this.commit()
      return inserted
    }

    let insertAt = this.index + 1
    while (this.entries[insertAt]?.origin === 'playNext') insertAt += 1
    this.entries.splice(insertAt, 0, ...inserted)

    if (this.shuffle) {
      this.insertAfterPlayNextInOriginalOrder(
        current.entryId,
        inserted.map((entry) => entry.entryId)
      )
    } else {
      this.originalOrder.splice(
        insertAt,
        0,
        ...inserted.map((entry) => entry.entryId)
      )
    }

    this.commit()
    return inserted
  }

  addToQueue(tracks: readonly Track[]): QueueEntry[] {
    if (tracks.length === 0) return []

    const added = tracks.map((track) => this.createEntry(track, 'added'))
    this.entries.push(...added)
    this.originalOrder.push(...added.map((entry) => entry.entryId))
    this.commit()
    return added
  }

  remove(entryId: string): boolean {
    const removeAt = this.entries.findIndex((entry) => entry.entryId === entryId)
    if (removeAt < 0 || removeAt === this.index) return false

    this.entries.splice(removeAt, 1)
    this.originalOrder = this.originalOrder.filter((id) => id !== entryId)
    if (removeAt < this.index) this.index -= 1
    this.commit()
    return true
  }

  move(entryId: string, toIndex: number): boolean {
    const from = this.entries.findIndex((entry) => entry.entryId === entryId)
    if (from < 0) return false

    const to = clampIndex(toIndex, this.entries.length)
    if (from === to) return true

    const currentId = this.currentEntry()?.entryId ?? null
    const [entry] = this.entries.splice(from, 1)
    this.entries.splice(to, 0, entry)

    // Manual reordering while shuffled is intentionally not preserved when shuffle is turned off.
    if (!this.shuffle) {
      this.originalOrder = this.entries.map((item) => item.entryId)
    }
    if (currentId) this.index = this.entries.findIndex((item) => item.entryId === currentId)

    this.commit()
    return true
  }

  jumpTo(entryId: string): QueueEntry | null {
    const target = this.entries.findIndex((entry) => entry.entryId === entryId)
    if (target < 0) return null
    if (target === this.index) return this.entries[target] ?? null

    this.index = target
    this.commit()
    return this.currentEntry()
  }

  clearUpcoming(): number {
    if (this.entries.length === 0) return 0

    const from = this.index + 1
    const removed = this.entries.splice(from)
    if (removed.length === 0) return 0

    const removedIds = new Set(removed.map((entry) => entry.entryId))
    this.originalOrder = this.originalOrder.filter((id) => !removedIds.has(id))
    this.commit()
    return removed.length
  }

  clear(): number {
    if (
      this.entries.length === 0 &&
      this.index === -1 &&
      this.context === null
    ) {
      return 0
    }

    const removed = this.entries.length
    this.entries = []
    this.originalOrder = []
    this.index = -1
    this.context = null
    this.commit()
    return removed
  }

  setShuffle(enabled: boolean): void {
    const next = enabled === true
    if (next === this.shuffle) return

    this.shuffle = next

    if (next) {
      if (this.index >= 0) {
        const history = this.entries.slice(0, this.index + 1)
        const upcoming = this.entries.slice(this.index + 1)
        this.entries = [...history, ...shuffleArray(upcoming, this.random)]
      } else {
        this.entries = shuffleArray(this.entries, this.random)
      }
    } else {
      // Rebuild the natural order around the current entry so the next track is the
      // current track's natural successor, not whatever came before it in the album.
      const currentId = this.currentEntry()?.entryId ?? null
      const byId = new Map(this.entries.map((entry) => [entry.entryId, entry]))
      const ordered: QueueEntry[] = []

      for (const id of this.originalOrder) {
        const entry = byId.get(id)
        if (entry) {
          ordered.push(entry)
          byId.delete(id)
        }
      }
      // Keep entries that somehow fell out of originalOrder instead of dropping them.
      ordered.push(...byId.values())

      const currentIndex = currentId
        ? ordered.findIndex((entry) => entry.entryId === currentId)
        : this.index

      if (!currentId || currentIndex >= 0) {
        this.entries = ordered
        this.index = currentIndex
      }
    }

    this.commit()
  }

  setRepeat(mode: RepeatMode): void {
    const next = normalizeRepeat(mode)
    if (next === this.repeat) return

    this.repeat = next
    this.commit()
  }

  reconcile(
    trackLookup: (trackId: string) => Track | null | undefined
  ): QueueEntry | null {
    const current = this.currentEntry()
    if (!current) return null

    const kept: QueueEntry[] = []
    for (const entry of this.entries) {
      const track = trackLookup(entry.track.id)
      if (track) kept.push({ ...entry, track })
    }

    const nextIndex = kept.findIndex((entry) => entry.entryId === current.entryId)
    if (nextIndex < 0) {
      this.entries = []
      this.originalOrder = []
      this.index = -1
      this.context = null
      this.commit()
      return null
    }

    const keptIds = new Set(kept.map((entry) => entry.entryId))
    this.entries = kept
    this.originalOrder = this.originalOrder.filter((id) => keptIds.has(id))
    this.index = nextIndex
    this.commit()
    return kept[nextIndex]
  }

  /** Plain-JSON snapshot of the play order, natural order, current entry, and context. */
  exportState(): SessionQueueState {
    return {
      version: 1,
      entries: this.entries.map((entry) => ({
        entryId: entry.entryId,
        trackId: entry.track.id,
        origin: entry.origin
      })),
      originalOrder: [...this.originalOrder],
      currentEntryId: this.currentEntry()?.entryId ?? null,
      context: this.context ? { ...this.context } : null
    }
  }

  /**
   * Restores a previously exported state. Tracks are resolved by id; vanished entries are
   * dropped, a vanished current entry restarts at the first survivor, and the natural order is
   * rebuilt without shuffling.
   */
  importState(
    state: unknown,
    trackLookup: (trackId: string) => Track | null | undefined
  ): QueueEntry | null {
    const candidate = normalizeImportedState(state)
    if (!candidate) {
      this.entries = []
      this.originalOrder = []
      this.index = -1
      this.context = null
      this.commit()
      return null
    }

    const kept: QueueEntry[] = []
    const seen = new Set<string>()
    for (const entry of candidate.entries) {
      if (kept.length >= IMPORT_ENTRY_LIMIT) break
      if (seen.has(entry.entryId)) continue

      const track = trackLookup(entry.trackId)
      if (!track) continue

      seen.add(entry.entryId)
      kept.push({ entryId: entry.entryId, track, origin: entry.origin })
    }

    this.entries = kept
    this.originalOrder = rebuildOriginalOrder(kept, candidate.originalOrder)
    this.entryCounter = highestEntryCounter(kept)

    if (kept.length === 0) {
      this.index = -1
      this.context = null
      this.commit()
      return null
    }

    const currentIndex = candidate.currentEntryId
      ? kept.findIndex((entry) => entry.entryId === candidate.currentEntryId)
      : -1
    this.index = currentIndex >= 0 ? currentIndex : 0
    this.context = candidate.context
    this.commit()
    return this.currentEntry()
  }

  private currentEntry(): QueueEntry | null {
    if (this.index < 0) return null
    return this.entries[this.index] ?? null
  }

  private createEntry(track: Track, origin: QueueOrigin): QueueEntry {
    this.entryCounter += 1
    return { entryId: `entry-${this.entryCounter}`, track, origin }
  }

  private insertAfterPlayNextInOriginalOrder(currentId: string, ids: string[]): void {
    const currentAt = this.originalOrder.indexOf(currentId)
    let insertAt = currentAt < 0 ? this.originalOrder.length : currentAt + 1
    const byId = new Map(this.entries.map((entry) => [entry.entryId, entry]))

    while (insertAt < this.originalOrder.length) {
      const entry = byId.get(this.originalOrder[insertAt])
      if (entry?.origin !== 'playNext') break
      insertAt += 1
    }

    this.originalOrder.splice(insertAt, 0, ...ids)
  }

  private commit(): void {
    this.version += 1
    this.cachedSnapshot = null
    this.pendingWrapOrder = null

    const snapshot = this.getSnapshot()
    for (const listener of [...this.listeners]) listener(snapshot)
  }
}

interface ImportedState {
  entries: Array<{ entryId: string; trackId: string; origin: QueueOrigin }>
  originalOrder: string[]
  currentEntryId: string | null
  context: QueueContext | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= 128 ? value : null
}

function normalizeImportedState(value: unknown): ImportedState | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) return null

  const entries: ImportedState['entries'] = []
  for (const raw of value.entries.slice(0, IMPORT_ENTRY_LIMIT)) {
    if (!isRecord(raw)) continue
    const entryId = boundedId(raw.entryId)
    const trackId = boundedId(raw.trackId)
    if (!entryId || !trackId) continue
    entries.push({
      entryId,
      trackId,
      origin: normalizeOrigin(raw.origin)
    })
  }

  const originalOrder: string[] = []
  if (Array.isArray(value.originalOrder)) {
    for (const raw of value.originalOrder.slice(0, IMPORT_ENTRY_LIMIT)) {
      const id = boundedId(raw)
      if (id && !originalOrder.includes(id)) originalOrder.push(id)
    }
  }

  return {
    entries,
    originalOrder,
    currentEntryId: boundedId(value.currentEntryId),
    context: normalizeContext(value.context)
  }
}

function normalizeOrigin(value: unknown): QueueOrigin {
  return value === 'playNext' || value === 'added' ? value : 'context'
}

function normalizeContext(value: unknown): QueueContext | null {
  if (!isRecord(value) || typeof value.kind !== 'string' || !CONTEXT_KINDS.has(value.kind)) {
    return null
  }
  if (typeof value.label !== 'string' || value.label.length > 200) return null
  return { kind: value.kind as QueueContext['kind'], label: value.label }
}

function rebuildOriginalOrder(
  kept: readonly QueueEntry[],
  savedOrder: readonly string[]
): string[] {
  const keptIds = new Set(kept.map((entry) => entry.entryId))
  const ordered: string[] = []

  for (const id of savedOrder) {
    if (keptIds.has(id) && !ordered.includes(id)) ordered.push(id)
  }
  for (const entry of kept) {
    if (!ordered.includes(entry.entryId)) ordered.push(entry.entryId)
  }

  return ordered
}

function highestEntryCounter(kept: readonly QueueEntry[]): number {
  let highest = kept.length
  for (const entry of kept) {
    const match = /^entry-(\d+)$/.exec(entry.entryId)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return highest
}

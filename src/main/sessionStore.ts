import type { RestoredSession, SessionPositionState, SessionQueueState } from '../shared/types'
import { readJsonFile, writeJsonAtomic } from './json-file'
import {
  normalizeRestoredSession,
  normalizeSessionPosition,
  normalizeSessionQueue,
  SESSION_VERSION
} from './sessionValidation'
import { decideSessionWrites } from './sessionWritePolicy'

const POSITION_WRITE_INTERVAL_MS = 1000

interface QueueFile {
  version: number
  folder: string | null
  queue: unknown
}

interface PositionFile {
  version: number
  folder: string | null
  position: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function folderMatches(saved: unknown, current: string | null): boolean {
  if (saved === null) return current === null
  return typeof saved === 'string' && saved === current
}

/**
 * Owns the machine-local resume session. Queue and position live in separate files so frequent
 * position updates never rewrite a queue that can hold thousands of entries.
 */
export class SessionStore {
  private readonly queueFile: string
  private readonly positionFile: string
  private readonly getFolder: () => string | null
  private restored: RestoredSession | null = null
  private queue: SessionQueueState | null = null
  private position: SessionPositionState | null = null
  private lastQueueKey: string | null = null
  private lastPositionKey: string | null = null
  private lastPositionWriteAt = 0
  private writeChain: Promise<void> = Promise.resolve()

  constructor(queueFile: string, positionFile: string, getFolder: () => string | null) {
    this.queueFile = queueFile
    this.positionFile = positionFile
    this.getFolder = getFolder
  }

  /** Loads and validates both files; a folder mismatch or bad data means "no session". */
  async load(): Promise<RestoredSession | null> {
    const folder = this.getFolder()
    const rawQueue = await readJsonFile<unknown>(this.queueFile, null)
    if (!isRecord(rawQueue) || rawQueue.version !== SESSION_VERSION) {
      this.restored = null
      return null
    }
    if (!folderMatches(rawQueue.folder, folder)) {
      this.restored = null
      return null
    }

    const rawPosition = await readJsonFile<unknown>(this.positionFile, null)
    const positionPayload =
      isRecord(rawPosition) &&
      rawPosition.version === SESSION_VERSION &&
      folderMatches(rawPosition.folder, folder)
        ? rawPosition.position
        : null

    this.restored = normalizeRestoredSession(rawQueue.queue, positionPayload)
    if (!this.restored) return null

    this.queue = this.restored.queue
    this.position = this.restored.position
    this.lastQueueKey = JSON.stringify(this.queue)
    this.lastPositionKey = this.position ? positionKey(this.position) : null
    this.lastPositionWriteAt = this.position ? Date.now() : 0
    return this.restored
  }

  getSession(): RestoredSession | null {
    return this.restored
  }

  updateQueue(value: unknown): void {
    const normalized = normalizeSessionQueue(value)
    if (!normalized) return

    this.queue = normalized
    this.restored = { queue: normalized, position: this.position }
    if (
      this.position &&
      !normalized.entries.some((entry) => entry.entryId === this.position?.entryId)
    ) {
      this.position = null
      this.restored.position = null
    }

    const now = Date.now()
    const decision = decideSessionWrites({
      lastQueueKey: this.lastQueueKey,
      lastPositionKey: this.lastPositionKey,
      lastPositionWriteAt: this.lastPositionWriteAt,
      nextQueueKey: JSON.stringify(normalized),
      nextPositionKey: this.position ? positionKey(this.position) : '',
      now,
      positionIntervalMs: POSITION_WRITE_INTERVAL_MS
    })

    if (decision.writeQueue) {
      this.lastQueueKey = JSON.stringify(normalized)
      this.enqueueQueueWrite(normalized)
    }
    if (decision.writePosition && this.position) {
      this.lastPositionKey = positionKey(this.position)
      this.lastPositionWriteAt = now
      this.enqueuePositionWrite(this.position)
    }
  }

  updatePosition(value: unknown): void {
    const normalized = normalizeSessionPosition(value)
    if (!normalized || !this.queue) return

    const entry = this.queue.entries.find((item) => item.entryId === normalized.entryId)
    if (!entry || entry.trackId !== normalized.trackId) return

    this.position = normalized
    this.restored = { queue: this.queue, position: normalized }

    const now = Date.now()
    const decision = decideSessionWrites({
      lastQueueKey: this.lastQueueKey,
      lastPositionKey: this.lastPositionKey,
      lastPositionWriteAt: this.lastPositionWriteAt,
      nextQueueKey: this.lastQueueKey ?? '',
      nextPositionKey: positionKey(normalized),
      now,
      positionIntervalMs: POSITION_WRITE_INTERVAL_MS
    })

    if (decision.writePosition) {
      this.lastPositionKey = positionKey(normalized)
      this.lastPositionWriteAt = now
      this.enqueuePositionWrite(normalized)
    }
  }

  /** Writes the latest in-memory payload regardless of throttling; used on quit/close. */
  async flush(): Promise<void> {
    if (this.queue) {
      this.lastQueueKey = JSON.stringify(this.queue)
      this.enqueueQueueWrite(this.queue)
    }
    if (this.position) {
      this.lastPositionKey = positionKey(this.position)
      this.enqueuePositionWrite(this.position)
    }
    await this.writeChain
  }

  private enqueueQueueWrite(queue: SessionQueueState): void {
    const payload: QueueFile = {
      version: SESSION_VERSION,
      folder: this.getFolder(),
      queue
    }
    this.writeChain = this.writeChain
      .then(() => writeJsonAtomic(this.queueFile, payload))
      .catch((error) => console.error('[session] Could not save the queue session', error))
  }

  private enqueuePositionWrite(position: SessionPositionState): void {
    const payload: PositionFile = {
      version: SESSION_VERSION,
      folder: this.getFolder(),
      position
    }
    this.writeChain = this.writeChain
      .then(() => writeJsonAtomic(this.positionFile, payload))
      .catch((error) => console.error('[session] Could not save the playback position', error))
  }
}

function positionKey(position: SessionPositionState): string {
  return `${position.entryId}:${position.trackId}:${position.position.toFixed(1)}`
}

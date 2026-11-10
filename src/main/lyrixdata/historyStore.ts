import type {
  Album,
  HistoryBlockedReason,
  HistoryRecordingState,
  HistorySetResult,
  HistoryState,
  LyrixDataStatus,
  Track
} from '../../shared/types'
import {
  aggregateHistory,
  HISTORY_DEFAULT_LIMIT,
  HISTORY_DOUBLE_COUNT_MS,
  HISTORY_READ_BYTES,
  lastResolvedTrackId,
  parseHistoryText,
  serializeHistoryRecord
} from './historyLog'
import type { LyrixDataStore } from './lyrixDataStore'
import { buildRefIndex, createTrackRef, resolveTrackRef } from './trackRef'
import type { TrackRefIndex, TrackRefSource } from './trackRef'

const HISTORY_FILE = 'history.jsonl'
const CHANGE_DEBOUNCE_MS = 300

export interface HistoryStoreOptions {
  store: LyrixDataStore
  resolveTrackFile(trackId: string): string | null
  onStateChange(state: HistoryState): void
  now?(): number
  debounceMs?: number
}

const EMPTY_RECORDING: HistoryRecordingState = {
  enabled: false,
  status: 'off',
  reason: null
}

const EMPTY_STATE: HistoryState = { recent: [], recording: EMPTY_RECORDING }

/**
 * Library-resident play history. Recording is gated by library.json; appends only go through the
 * serialized LyrixData store and never create a folder for a library that has not opted in.
 */
export class HistoryStore {
  private readonly options: HistoryStoreOptions
  private root: string | null = null
  private index: TrackRefIndex | null = null
  private trackById = new Map<string, TrackRefSource>()
  private state: HistoryState = EMPTY_STATE
  private emitTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: HistoryStoreOptions) {
    this.options = options
  }

  getState(): HistoryState {
    return this.state
  }

  /** Rebinds to a library snapshot, re-resolves all records, and emits immediately. */
  async setLibrary(root: string | null, albums: readonly Album[]): Promise<HistoryState> {
    this.root = root
    this.buildIndex(albums)
    this.state = await this.buildState()
    this.options.onStateChange(this.state)
    return this.state
  }

  async refresh(limit = HISTORY_DEFAULT_LIMIT): Promise<HistoryState> {
    this.state = await this.buildState(limit)
    this.options.onStateChange(this.state)
    return this.state
  }

  /** Fresh state for `history:get` without pushing an event. */
  async read(limit = HISTORY_DEFAULT_LIMIT): Promise<HistoryState> {
    this.state = await this.buildState(limit)
    return this.state
  }

  async record(trackId: string): Promise<{ ok: boolean }> {
    const recording = await this.readRecording()
    if (!recording.enabled || !this.index) return { ok: true }

    const source = this.trackById.get(trackId)
    if (!source) return { ok: true }

    const now = this.options.now?.() ?? Date.now()
    const tail = await this.options.store.readTail(HISTORY_FILE, HISTORY_READ_BYTES)
    const records = parseHistoryText(tail)

    if (
      lastResolvedTrackId(records, this.index) === trackId &&
      records.length > 0 &&
      now - records[records.length - 1].at < HISTORY_DOUBLE_COUNT_MS
    ) {
      return { ok: true }
    }

    const ref = this.root ? createTrackRef(source.track, this.root, source.filePath) : null
    if (!ref) return { ok: true }

    const result = await this.options.store.appendLine(
      HISTORY_FILE,
      serializeHistoryRecord({
        v: 1,
        ref,
        at: now,
        m: this.options.store.getMachineId()
      })
    )

    if (!result.ok) {
      this.scheduleEmit()
      return { ok: false }
    }

    this.scheduleEmit()
    return { ok: true }
  }

  async setRecording(enabled: boolean): Promise<HistorySetResult> {
    const result = await this.options.store.setHistoryRecording(enabled)
    if (!result.ok) {
      this.scheduleEmit()
      return { ok: false, reason: result.reason }
    }

    this.state = await this.buildState()
    this.options.onStateChange(this.state)
    return { ok: true, state: this.state }
  }

  async clear(): Promise<HistorySetResult> {
    const result = await this.options.store.clearLineFile(HISTORY_FILE)
    if (!result.ok) return { ok: false, reason: result.reason }

    this.state = await this.buildState()
    this.options.onStateChange(this.state)
    return { ok: true, state: this.state }
  }

  private async buildState(limit = HISTORY_DEFAULT_LIMIT): Promise<HistoryState> {
    const recording = await this.readRecording()
    const tail = await this.options.store.readTail(HISTORY_FILE, HISTORY_READ_BYTES)
    const recent =
      this.index === null ? [] : aggregateHistory(parseHistoryText(tail), this.index, limit)
    return { recent, recording }
  }

  private async readRecording(): Promise<HistoryRecordingState> {
    const status = this.options.store.getStatus()
    if (status.state === 'unbound') return EMPTY_RECORDING
    if (status.state === 'not-created') {
      return { enabled: false, status: 'not-created', reason: null }
    }

    const flag = await this.options.store.getHistoryRecording()
    const blocked = blockedReasonForStatus(status.state)
    if (blocked) {
      return {
        enabled: flag.enabled,
        status: 'blocked',
        reason: blocked
      }
    }

    if (flag.newerVersion) {
      return { enabled: false, status: 'blocked', reason: 'newer-version' }
    }

    return {
      enabled: flag.enabled,
      status: flag.enabled ? 'recording' : 'off',
      reason: null
    }
  }

  private buildIndex(albums: readonly Album[]): void {
    const sources: Array<{ track: Track; filePath: string }> = []
    this.trackById = new Map()

    for (const album of albums) {
      for (const track of album.tracks) {
        const filePath = this.options.resolveTrackFile(track.id)
        if (!filePath) continue
        sources.push({ track, filePath })
      }
    }

    if (!this.root) {
      this.index = null
      return
    }

    this.index = buildRefIndex(sources, this.root)
    for (const source of this.index.byPath.values()) {
      this.trackById.set(source.track.id, source)
    }
  }

  private scheduleEmit(): void {
    if (this.emitTimer !== null) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      void this.buildState().then((state) => {
        this.state = state
        this.options.onStateChange(state)
      })
    }, this.options.debounceMs ?? CHANGE_DEBOUNCE_MS)
  }

  /** Resolves a ref for tests and future consumers without exposing it over IPC. */
  resolveRefForTest(ref: Parameters<typeof resolveTrackRef>[0]): string | null {
    if (!this.index) return null
    const result = resolveTrackRef(ref, this.index)
    return result.status === 'missing' ? null : result.track.id
  }
}

function blockedReasonForStatus(state: LyrixDataStatus['state']): HistoryBlockedReason | null {
  if (state === 'read-only') return 'read-only'
  if (state === 'unavailable') return 'unavailable'
  if (state === 'newer-version') return 'newer-version'
  return null
}

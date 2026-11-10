import type {
  HistoryBlockedReason,
  HistoryRecordingState,
  HistorySetResult,
  HistoryState
} from '../../shared/types'
import type { HistoryItem } from '../../shared/types'
import { blockedHistoryMessage } from './historyStatusModel'
import { OnceNotifier } from './onceNotifier'

export interface HistoryApi {
  getHistory(options?: { limit?: number }): Promise<HistoryState>
  recordPlay(trackId: string): Promise<{ ok: boolean }>
  setHistoryRecording(enabled: boolean): Promise<HistorySetResult>
  clearHistory(): Promise<HistorySetResult>
  onHistoryChanged(listener: (state: HistoryState) => void): () => void
}

export interface HistoryControllerState {
  items: readonly HistoryItem[]
  recording: HistoryRecordingState
  loaded: boolean
}

export interface HistoryControllerDeps {
  api: HistoryApi
  toast(message: string): void
  onWriteBlocked(reason: HistoryBlockedReason, retryAction: () => void): void
  onStateChange?(state: HistoryControllerState): void
  notifier?: OnceNotifier
}

const EMPTY_RECORDING: HistoryRecordingState = {
  enabled: false,
  status: 'off',
  reason: null
}

/** DOM-free history state. Passive traffic never opens the disclaimer. */
export class HistoryController {
  private readonly deps: HistoryControllerDeps
  private readonly notifier: OnceNotifier
  private state: HistoryControllerState = {
    items: [],
    recording: EMPTY_RECORDING,
    loaded: false
  }
  private readonly listeners = new Set<(state: HistoryControllerState) => void>()

  constructor(deps: HistoryControllerDeps) {
    this.deps = deps
    this.notifier = deps.notifier ?? new OnceNotifier()
  }

  getState(): HistoryControllerState {
    return this.state
  }

  subscribe(listener: (state: HistoryControllerState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async reload(): Promise<void> {
    try {
      this.apply(await this.deps.api.getHistory())
    } catch (error) {
      console.error('[renderer] Could not load play history', error)
    }
  }

  /** Fire-and-forget: recording failures never open the disclaimer. */
  record(trackId: string): void {
    void this.deps.api.recordPlay(trackId).catch(() => undefined)
  }

  async setRecording(enabled: boolean): Promise<void> {
    const result = await this.requestSetRecording(enabled)
    if (result.ok) {
      this.apply(result.state)
      return
    }
    this.deps.onWriteBlocked(blockedReason(result.reason), () => void this.setRecording(enabled))
  }

  async clear(): Promise<void> {
    let result: HistorySetResult
    try {
      result = await this.deps.api.clearHistory()
    } catch (error) {
      console.error('[renderer] Could not clear play history', error)
      result = { ok: false, reason: 'unavailable' }
    }

    if (result.ok) {
      this.apply(result.state)
      return
    }
    this.deps.onWriteBlocked(blockedReason(result.reason), () => void this.clear())
  }

  /** Resets the quiet notifier when the bound library changes. */
  noteLibraryChanged(): void {
    this.notifier.reset()
    void this.reload()
  }

  start(): () => void {
    return this.deps.api.onHistoryChanged((state) => this.apply(state))
  }

  private async requestSetRecording(enabled: boolean): Promise<HistorySetResult> {
    try {
      return await this.deps.api.setHistoryRecording(enabled)
    } catch (error) {
      console.error('[renderer] Could not change history recording', error)
      return { ok: false, reason: 'unavailable' }
    }
  }

  private apply(state: HistoryState): void {
    const previous = this.state.recording
    const next = state.recording

    if (
      next.status === 'blocked' &&
      next.enabled &&
      next.reason &&
      (previous.enabled || previous.status === 'recording') &&
      this.notifier.tryNotify()
    ) {
      this.deps.toast(blockedHistoryMessage(next.reason))
    }

    this.state = {
      items: state.recent,
      recording: next,
      loaded: true
    }
    this.deps.onStateChange?.(this.state)
    for (const listener of [...this.listeners]) listener(this.state)
  }
}

function blockedReason(
  reason: 'read-only' | 'unavailable' | 'newer-version' | 'invalid'
): HistoryBlockedReason {
  if (reason === 'read-only' || reason === 'unavailable' || reason === 'newer-version') {
    return reason
  }
  return 'unavailable'
}

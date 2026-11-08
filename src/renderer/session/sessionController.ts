import type { SessionPositionState, SessionQueueState } from '../../shared/types'
import type { PlaybackEngine } from '../player/engine'
import type { PlaybackQueue } from '../player/queue'
import {
  SESSION_QUEUE_DEBOUNCE_MS,
  shouldSendPosition
} from './sessionTiming'
import type { PositionUpdateReason } from './sessionTiming'

export interface SessionControllerDeps {
  queue: PlaybackQueue
  engine: PlaybackEngine
  saveQueue(state: SessionQueueState): void
  savePosition(state: SessionPositionState): void
  now?(): number
}

/**
 * Tracks queue and position changes and forwards them to main. It stays idle until `start()` is
 * called, so the state applied by session restore is never written back over the stored session.
 */
export class SessionController {
  private readonly deps: SessionControllerDeps
  private started = false
  private queueTimer: ReturnType<typeof setTimeout> | null = null
  private lastPositionSentAt = 0
  private lastEntryId: string | null = null
  private unsubscribers: Array<() => void> = []

  constructor(deps: SessionControllerDeps) {
    this.deps = deps
  }

  start(): () => void {
    if (this.started) return () => undefined
    this.started = true
    this.lastEntryId = this.currentEntryId()

    const { engine, queue } = this.deps
    this.unsubscribers = [
      queue.subscribe(() => this.handleQueueChange()),
      engine.on('timeupdate', (position) => this.sendPosition('timeupdate', position)),
      engine.on('pause', () => this.sendPosition('pause')),
      engine.on('ended', () => this.sendPosition('ended')),
      engine.on('loadedmetadata', () => this.sendPosition('trackChange', 0))
    ]

    return () => this.dispose()
  }

  /** Called by the transport when a seek slider drag finishes. */
  noteSeek(): void {
    this.sendPosition('seek')
  }

  /** Bypasses throttling; called before the window closes. */
  flush(): void {
    if (!this.started) return

    if (this.queueTimer !== null) {
      clearTimeout(this.queueTimer)
      this.queueTimer = null
    }
    this.sendQueue()
    this.sendPosition('flush')
  }

  dispose(): void {
    this.started = false
    if (this.queueTimer !== null) {
      clearTimeout(this.queueTimer)
      this.queueTimer = null
    }
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
  }

  private handleQueueChange(): void {
    if (!this.started) return

    this.scheduleQueueSave()

    const entryId = this.currentEntryId()
    if (entryId !== this.lastEntryId) {
      this.lastEntryId = entryId
      // The new track has not loaded yet, so its saved position is the beginning.
      this.sendPosition('trackChange', 0)
    }
  }

  private scheduleQueueSave(): void {
    if (this.queueTimer !== null) clearTimeout(this.queueTimer)
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null
      this.sendQueue()
    }, SESSION_QUEUE_DEBOUNCE_MS)
  }

  private sendQueue(): void {
    if (!this.started) return
    this.deps.saveQueue(this.deps.queue.exportState())
  }

  private sendPosition(reason: PositionUpdateReason, position?: number): void {
    if (!this.started) return

    const current = this.deps.queue.getSnapshot().current
    if (!current) return

    const now = this.deps.now?.() ?? Date.now()
    if (reason === 'timeupdate' && !this.deps.engine.isPlaying()) return
    if (!shouldSendPosition(reason, this.lastPositionSentAt, now)) return

    this.lastPositionSentAt = now
    this.deps.savePosition({
      entryId: current.entryId,
      trackId: current.track.id,
      position: Math.max(0, position ?? this.deps.engine.getPosition())
    })
  }

  private currentEntryId(): string | null {
    return this.deps.queue.getSnapshot().current?.entryId ?? null
  }
}

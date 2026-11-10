/** Pure play-instance state machine. All clocks are injected by the caller. */

export interface PlayTrackerEntry {
  trackId: string
  /** Queue entry identity. A different entry for the same track is a new instance. */
  entryId?: string
  durationSec: number | null
}

export interface PlayTrackerOptions {
  onCounted(trackId: string): void
  /** Largest wall-clock delta a single tick may add. */
  maxTickMs?: number
  /** Longest listening threshold for unknown/long tracks. */
  minThresholdMs?: number
}

const DEFAULT_MAX_TICK_MS = 2000
const DEFAULT_MIN_THRESHOLD_MS = 30_000
const RELATIVE_THRESHOLD = 0.5

interface Instance {
  trackId: string
  key: string
  thresholdMs: number
  listenedMs: number
  lastTickAt: number
  wasPlaying: boolean
  counted: boolean
}

/** Counts listened time only while an instance is actually playing. */
export class PlayTracker {
  private readonly options: PlayTrackerOptions
  private readonly maxTickMs: number
  private readonly minThresholdMs: number
  private instance: Instance | null = null

  constructor(options: PlayTrackerOptions) {
    this.options = options
    this.maxTickMs = options.maxTickMs ?? DEFAULT_MAX_TICK_MS
    this.minThresholdMs = options.minThresholdMs ?? DEFAULT_MIN_THRESHOLD_MS
  }

  start(entry: PlayTrackerEntry, nowMs: number): void {
    this.instance = this.createInstance(entry, nowMs)
  }

  /** Starts only when there is no active instance or the entry changed (resume is not a restart). */
  play(entry: PlayTrackerEntry, nowMs: number): void {
    if (this.instance?.key === entryKey(entry)) return
    this.instance = this.createInstance(entry, nowMs)
  }

  /** A repeat-one restart or replay after ending is a brand-new instance. */
  restart(entry: PlayTrackerEntry, nowMs: number): void {
    this.instance = this.createInstance(entry, nowMs)
  }

  tick(nowMs: number, playing: boolean, key: string): void {
    const instance = this.instance
    if (!instance || instance.key !== key) return

    if (!playing) {
      instance.wasPlaying = false
      instance.lastTickAt = nowMs
      return
    }

    if (!instance.wasPlaying) {
      instance.wasPlaying = true
      instance.lastTickAt = nowMs
      return
    }

    const delta = Math.max(0, Math.min(nowMs - instance.lastTickAt, this.maxTickMs))
    instance.lastTickAt = nowMs
    if (delta === 0 || instance.counted) return

    instance.listenedMs += delta
    if (instance.listenedMs < instance.thresholdMs) return

    instance.counted = true
    this.options.onCounted(instance.trackId)
  }

  /** Ends the current instance without counting (track ended/stopped). */
  finish(): void {
    this.instance = null
  }

  /** A failed track never counts and cannot leak into the next instance. */
  fail(): void {
    this.instance = null
  }

  isActive(entryKey?: string): boolean {
    if (!this.instance) return false
    return entryKey === undefined || this.instance.key === entryKey
  }

  private createInstance(entry: PlayTrackerEntry, nowMs: number): Instance {
    return {
      trackId: entry.trackId,
      key: entryKey(entry),
      thresholdMs: thresholdFor(entry.durationSec, this.minThresholdMs),
      listenedMs: 0,
      lastTickAt: nowMs,
      wasPlaying: false,
      counted: false
    }
  }
}

function entryKey(entry: PlayTrackerEntry): string {
  return entry.entryId ?? entry.trackId
}

/** `min(30 s, 50% of duration)`; unknown/non-finite durations use the minimum threshold. */
export function thresholdFor(
  durationSec: number | null,
  minThresholdMs = DEFAULT_MIN_THRESHOLD_MS
): number {
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return minThresholdMs
  }
  return Math.min(minThresholdMs, durationSec * 1000 * RELATIVE_THRESHOLD)
}

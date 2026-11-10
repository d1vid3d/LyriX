import { MEDIA_KEY_MODE } from '../../shared/mediaKeys'
import type { Album, MediaKeyAction, Track } from '../../shared/types'
import type { PlaybackEngine } from '../player/engine'
import type { PlaybackQueue } from '../player/queue'
import { buildMediaMetadata, mapMediaAction } from './mediaSessionModel'

export interface MediaSessionDeps {
  engine: PlaybackEngine
  queue: PlaybackQueue
  getAlbumForTrack(track: Track): Album | null
  play(): void
  pause(): void
  playPause(): void
  previous(): void
  next(): void
  seekBy(delta: number): void
  seekTo(seconds: number): void
  subscribeMediaKey(listener: (action: MediaKeyAction) => void): () => void
}

const SESSION_ACTIONS = [
  'play',
  'pause',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
  'seekto',
  'stop'
] as const

/**
 * Keeps Chromium's Media Session metadata/position in sync and registers one media-key route:
 * Media Session actions when that is the selected mode, or IPC-forwarded global shortcuts
 * otherwise. Every API call is guarded so unsupported platforms keep working normally.
 */
export class MediaSessionController {
  private readonly deps: MediaSessionDeps
  private mediaSession: MediaSession | null = null
  private unsubscribers: Array<() => void> = []
  private actions: MediaSessionAction[] = []

  constructor(deps: MediaSessionDeps) {
    this.deps = deps
  }

  start(): () => void {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !navigator.mediaSession
    ) {
      return () => undefined
    }

    this.mediaSession = navigator.mediaSession
    const { engine, queue } = this.deps

    this.unsubscribers = [
      queue.subscribe(() => {
        this.syncMetadata()
        this.syncPosition()
      }),
      engine.on('play', () => {
        this.setPlaybackState('playing')
        this.syncPosition()
      }),
      engine.on('pause', () => {
        this.setPlaybackState('paused')
        this.syncPosition()
      }),
      engine.on('ended', () => this.setPlaybackState('paused')),
      engine.on('loadedmetadata', () => this.syncPosition())
    ]

    if (MEDIA_KEY_MODE === 'media-session') {
      this.registerSessionActions()
    } else {
      this.unsubscribers.push(this.deps.subscribeMediaKey((action) => this.handleGlobalKey(action)))
    }

    this.syncMetadata()
    this.setPlaybackState(engine.isPlaying() ? 'playing' : 'paused')
    this.syncPosition()
    return () => this.dispose()
  }

  /** Re-publishes position after a normal seek; called from the transport seek-end hook. */
  syncPosition(): void {
    const session = this.mediaSession
    if (!session || typeof session.setPositionState !== 'function') return

    const { engine } = this.deps
    const duration = engine.getDuration()
    if (!(duration > 0) || !Number.isFinite(duration)) return

    const position = Math.min(Math.max(0, engine.getPosition()), duration)
    try {
      session.setPositionState({ duration, position, playbackRate: 1 })
    } catch (error) {
      console.warn('[media] Could not update the position state', error)
    }
  }

  dispose(): void {
    const session = this.mediaSession
    if (session) {
      for (const action of this.actions) {
        try {
          session.setActionHandler(action, null)
        } catch {
          // Unsupported actions are already absent.
        }
      }
    }
    this.actions = []
    this.mediaSession = null

    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
  }

  private syncMetadata(): void {
    const session = this.mediaSession
    if (!session || typeof MediaMetadata !== 'function') return

    const track = this.deps.queue.getSnapshot().current?.track ?? null
    if (!track) {
      session.metadata = null
      return
    }

    const album = this.deps.getAlbumForTrack(track)
    const model = buildMediaMetadata(track, album?.coverUrl ?? null)
    try {
      session.metadata = new MediaMetadata(model)
    } catch (error) {
      console.warn('[media] Could not build media metadata', error)
    }
  }

  private setPlaybackState(state: MediaSessionPlaybackState): void {
    if (!this.mediaSession) return
    try {
      this.mediaSession.playbackState = state
    } catch (error) {
      console.warn('[media] Could not set the playback state', error)
    }
  }

  private registerSessionActions(): void {
    const session = this.mediaSession
    if (!session) return

    for (const action of SESSION_ACTIONS) {
      try {
        session.setActionHandler(action, (details) => this.runAction(action, details ?? {}))
        this.actions.push(action)
      } catch {
        // The action is unavailable on this platform.
      }
    }
  }

  private runAction(action: MediaSessionAction, details: MediaSessionActionDetails): void {
    try {
      const mapped = mapMediaAction(action, details)
      if (!mapped) return

      switch (mapped.command) {
        case 'play':
          this.deps.play()
          return
        case 'pause':
          this.deps.pause()
          return
        case 'previous':
          this.deps.previous()
          return
        case 'next':
          this.deps.next()
          return
        case 'seekBackward':
          this.deps.seekBy(-(mapped.seconds ?? 0))
          return
        case 'seekForward':
          this.deps.seekBy(mapped.seconds ?? 0)
          return
        case 'seekTo':
          this.deps.seekTo(mapped.seconds ?? 0)
          return
        case 'stop':
          this.deps.pause()
          this.deps.seekTo(0)
          return
      }
    } catch (error) {
      console.warn(`[media] Media action ${action} failed`, error)
    }
  }

  private handleGlobalKey(action: MediaKeyAction): void {
    switch (action) {
      case 'playpause':
        this.deps.playPause()
        return
      case 'next':
        this.deps.next()
        return
      case 'previous':
        this.deps.previous()
        return
      case 'stop':
        this.deps.pause()
        this.deps.seekTo(0)
    }
  }
}

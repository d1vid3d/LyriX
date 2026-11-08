import type { Album, PlaybackSettingsInput, Track } from '../../shared/types'
import { getArtistTracks } from '../library/artistTracks'
import type { ArtistItem } from '../library/query'
import type { PlaybackEngine } from '../player/engine'
import type { PlaybackQueue, QueueContext, QueueEntry } from '../player/queue'
import {
  decideEndedAction,
  decideFailureAction,
  decidePreviousAction,
  nextRepeatMode
} from '../player/transportDecisions'
import type { AppElements } from './dom'
import { formatTime } from './format'

export interface TransportDeps {
  elements: AppElements
  engine: PlaybackEngine
  queue: PlaybackQueue
  getAlbums(): readonly Album[]
  getVisibleTracks(): readonly Track[]
  getSearchText(): string
  setLyricsTrack(trackId: string | null): void
  setStatus(text: string): void
  saveVolume(volume: number): void
  savePlaybackSettings(settings: PlaybackSettingsInput): void
  updateControls(): void
  updateNowPlaying(): void
  updateTrackHighlight(): void
  syncTime(time: number): void
  resetTime(): void
  updateDuration(duration: number): void
}

interface PlaybackAttempt {
  failed: boolean
}

function albumContext(album: Album): QueueContext {
  return { kind: 'album', label: album.title }
}

function artistContext(artist: ArtistItem): QueueContext {
  return { kind: 'artist', label: artist.name }
}

function randomStartIndex(length: number): number {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, Math.floor(Math.random() * length)))
}

/** Owns the queue, the playback engine, transport controls, seeking, and volume. */
export class TransportController {
  private readonly deps: TransportDeps
  private isSeeking = false
  private activeAttempt: PlaybackAttempt | null = null
  private consecutiveFailures = 0

  constructor(deps: TransportDeps) {
    this.deps = deps
    this.bindControls()
  }

  getCurrentTrack(): Track | null {
    return this.deps.queue.getSnapshot().current?.track ?? null
  }

  playQueue(
    tracks: readonly Track[],
    index: number,
    context: QueueContext | null = null
  ): void {
    const track = tracks[index]
    if (!track) return

    const wasCurrent = this.deps.queue.getSnapshot().current?.track.id === track.id
    this.consecutiveFailures = 0
    this.deps.queue.setQueue(tracks, index, { context })

    if (wasCurrent) {
      this.deps.updateTrackHighlight()
      this.deps.updateControls()
      if (!this.deps.engine.isPlaying()) this.resumeCurrentTrack()
      return
    }

    this.startCurrentTrack(true)
  }

  playAlbumTrack(album: Album, track: Track): void {
    const index = album.tracks.findIndex((item) => item.id === track.id)
    if (index < 0) return
    this.playQueue(album.tracks, index, albumContext(album))
  }

  playAlbum(album: Album): void {
    this.playQueue(album.tracks, 0, albumContext(album))
  }

  shuffleAlbum(album: Album): void {
    if (album.tracks.length === 0) return
    this.deps.queue.setShuffle(true)
    this.playQueue(album.tracks, randomStartIndex(album.tracks.length), albumContext(album))
  }

  playArtist(artist: ArtistItem): void {
    this.playQueue(getArtistTracks(artist), 0, artistContext(artist))
  }

  shuffleArtist(artist: ArtistItem): void {
    const tracks = getArtistTracks(artist)
    if (tracks.length === 0) return
    this.deps.queue.setShuffle(true)
    this.playQueue(tracks, randomStartIndex(tracks.length), artistContext(artist))
  }

  playVisibleTrack(index: number): void {
    const search = this.deps.getSearchText()
    const context: QueueContext =
      search.trim() === ''
        ? { kind: 'tracks', label: 'Tracks' }
        : { kind: 'search', label: search }
    this.playQueue(this.deps.getVisibleTracks(), index, context)
  }

  toggleShuffle(): void {
    const snapshot = this.deps.queue.getSnapshot()
    const shuffle = !snapshot.shuffle
    this.deps.queue.setShuffle(shuffle)
    this.deps.savePlaybackSettings({ shuffle, repeat: snapshot.repeat })
  }

  cycleRepeat(): void {
    const snapshot = this.deps.queue.getSnapshot()
    const repeat = nextRepeatMode(snapshot.repeat)
    this.deps.queue.setRepeat(repeat)
    this.deps.savePlaybackSettings({ shuffle: snapshot.shuffle, repeat })
  }

  startCurrentTrack(autoplay: boolean): void {
    const track = this.deps.queue.getSnapshot().current?.track ?? null
    if (!track) {
      this.resetPlayback()
      return
    }

    const attempt: PlaybackAttempt = { failed: false }
    this.activeAttempt = attempt

    this.deps.engine.load(track)
    this.deps.setLyricsTrack(track.id)
    this.resetTimeUi()
    this.deps.updateNowPlaying()
    this.deps.updateTrackHighlight()
    this.deps.updateControls()

    if (autoplay) {
      void this.deps.engine
        .play()
        .catch((error) => this.handlePlaybackFailure(attempt, error))
    }
  }

  resetPlayback(): void {
    this.activeAttempt = null
    this.consecutiveFailures = 0
    this.deps.queue.clear()
    this.deps.engine.pause()
    this.deps.setLyricsTrack(null)
    this.resetTimeUi()
    this.deps.updateControls()
    this.deps.updateNowPlaying()
    this.deps.updateTrackHighlight()
  }

  reconcileQueue(): void {
    const current = this.deps.queue.getSnapshot().current
    if (!current) return

    const reconciled = this.deps.queue.reconcile((trackId) => this.findTrackById(trackId))
    if (!reconciled) this.resetPlayback()
  }

  /** Subscribes to engine events and returns a single disposer for all of them. */
  start(): () => void {
    const unsubscribers = this.subscribeEngine()
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }

  private subscribeEngine(): Array<() => void> {
    const { engine } = this.deps
    return [
      engine.on('play', () => {
        this.consecutiveFailures = 0
        this.deps.updateControls()
      }),
      engine.on('pause', () => this.deps.updateControls()),
      engine.on('ended', () => this.handleEnded()),
      engine.on('loadedmetadata', (duration) => this.deps.updateDuration(duration)),
      engine.on('timeupdate', (position) => {
        if (!this.isSeeking) this.deps.syncTime(position)
      }),
      engine.on('error', (error) => {
        if (this.activeAttempt) this.handlePlaybackFailure(this.activeAttempt, error)
      })
    ]
  }

  private bindControls(): void {
    const { elements, engine } = this.deps

    elements.previousButton.addEventListener('click', () => this.previous())
    elements.playPauseButton.addEventListener('click', () => this.togglePlayPause())
    elements.nextButton.addEventListener('click', () => this.next())

    elements.seekBar.addEventListener('pointerdown', () => {
      this.isSeeking = true
    })

    elements.seekBar.addEventListener('input', () => {
      const time = Number(elements.seekBar.value)
      if (!Number.isFinite(time)) return

      elements.currentTimeLabel.textContent = formatTime(time)
      // Seek live while dragging; repeat range requests are handled by the media protocol.
      engine.seek(time)
    })

    const finishSeeking = (): void => {
      this.isSeeking = false
    }

    elements.seekBar.addEventListener('change', finishSeeking)
    elements.seekBar.addEventListener('pointerup', finishSeeking)
    elements.seekBar.addEventListener('pointercancel', finishSeeking)
    window.addEventListener('pointerup', finishSeeking)

    elements.volumeSlider.addEventListener('input', () => {
      engine.setVolume(Number(elements.volumeSlider.value))
    })

    elements.volumeSlider.addEventListener('change', () => {
      this.deps.saveVolume(Number(elements.volumeSlider.value))
    })
  }

  private resetTimeUi(): void {
    this.isSeeking = false
    this.deps.resetTime()
  }

  private previous(): void {
    const { engine, queue } = this.deps
    if (!queue.getSnapshot().current) return

    const position = engine.getPosition()
    if (Number.isFinite(position) && position > 3) {
      this.seekCurrentToStart()
      return
    }

    const previous = queue.previous()
    const action = decidePreviousAction(position, previous)
    if (action.type === 'play') {
      this.consecutiveFailures = 0
      this.startCurrentTrack(true)
      return
    }

    this.seekCurrentToStart()
  }

  private seekCurrentToStart(): void {
    this.deps.engine.seek(0)
    this.deps.syncTime(0)
  }

  private togglePlayPause(): void {
    const { engine, queue } = this.deps
    if (!queue.getSnapshot().current) return

    if (engine.isPlaying()) {
      engine.pause()
      return
    }

    this.consecutiveFailures = 0
    this.resumeCurrentTrack()
  }

  private next(): void {
    this.consecutiveFailures = 0
    const entry = this.deps.queue.advance('skip')
    if (entry) this.startCurrentTrack(true)
  }

  private resumeCurrentTrack(): void {
    const { engine, queue } = this.deps
    const track = queue.getSnapshot().current?.track ?? null
    if (!track) return

    const duration = engine.getDuration()
    if (duration > 0 && engine.getPosition() >= duration - 0.05) {
      engine.seek(0)
      this.deps.syncTime(0)
    }

    const attempt: PlaybackAttempt = { failed: false }
    this.activeAttempt = attempt
    void engine.play().catch((error) => this.handlePlaybackFailure(attempt, error))
  }

  private restartCurrentForRepeat(): void {
    const attempt: PlaybackAttempt = { failed: false }
    this.activeAttempt = attempt
    this.deps.engine.seek(0)
    this.deps.syncTime(0)
    void this.deps.engine
      .play()
      .catch((error) => this.handlePlaybackFailure(attempt, error))
  }

  private handlePlaybackFailure(attempt: PlaybackAttempt, error: unknown): void {
    if (this.activeAttempt !== attempt || attempt.failed) return

    // Pausing interrupts an in-flight play() promise. That is not a track failure.
    if (error instanceof Error && error.name === 'AbortError') return

    attempt.failed = true

    const snapshot = this.deps.queue.getSnapshot()
    const track = snapshot.current?.track ?? null
    console.error(`[renderer] Could not play ${track?.title ?? 'track'}`, error)
    this.deps.setStatus(track ? `Could not play ${track.title}.` : 'Could not play this file.')

    const decision = decideFailureAction(
      snapshot.entries.length,
      this.consecutiveFailures
    )
    this.consecutiveFailures = decision.failures

    if (decision.action === 'skip') {
      const entry = this.deps.queue.advance('skip')
      if (entry) {
        this.startCurrentTrack(true)
        return
      }
    }

    this.deps.engine.pause()
    this.deps.updateControls()
  }

  private handleEnded(): void {
    const snapshot = this.deps.queue.getSnapshot()
    const next = this.deps.queue.advance('ended')
    const action = decideEndedAction(snapshot.current, next)

    if (action.type === 'play') {
      this.startCurrentTrack(true)
      return
    }

    if (action.type === 'restart') {
      this.restartCurrentForRepeat()
      return
    }

    this.deps.engine.pause()
    this.deps.syncTime(this.deps.engine.getPosition())
    this.deps.updateControls()
  }

  private findTrackById(trackId: string): Track | null {
    for (const album of this.deps.getAlbums()) {
      const track = album.tracks.find((item) => item.id === trackId)
      if (track) return track
    }
    return null
  }
}

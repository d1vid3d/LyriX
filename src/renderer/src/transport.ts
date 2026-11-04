import type { Album, Track } from '../../shared/types'
import type { PlaybackEngine } from '../player/engine'
import type { PlaybackQueue } from '../player/queue'
import type { AppElements } from './dom'
import { formatTime } from './format'

export interface TransportDeps {
  elements: AppElements
  engine: PlaybackEngine
  queue: PlaybackQueue
  getAlbums(): readonly Album[]
  getVisibleTracks(): readonly Track[]
  setLyricsTrack(trackId: string | null): void
  setStatus(text: string): void
  saveVolume(volume: number): void
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

/** Owns the queue, the playback engine, transport controls, seeking, and volume. */
export class TransportController {
  private readonly deps: TransportDeps
  private isSeeking = false
  private activeAttempt: PlaybackAttempt | null = null

  constructor(deps: TransportDeps) {
    this.deps = deps
    this.bindControls()
  }

  getCurrentTrack(): Track | null {
    return this.deps.queue.current()
  }

  playQueue(tracks: readonly Track[], index: number): void {
    const track = tracks[index]
    if (!track) return

    const wasCurrent = this.deps.queue.current()?.id === track.id
    this.deps.queue.setQueue(tracks, index)

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
    this.playQueue(album.tracks, index)
  }

  playVisibleTrack(index: number): void {
    this.playQueue(this.deps.getVisibleTracks(), index)
  }

  startCurrentTrack(autoplay: boolean): void {
    const track = this.deps.queue.current()
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
    this.deps.queue.setQueue([])
    this.deps.engine.pause()
    this.deps.setLyricsTrack(null)
    this.resetTimeUi()
    this.deps.updateControls()
    this.deps.updateNowPlaying()
    this.deps.updateTrackHighlight()
  }

  reconcileQueue(): void {
    const current = this.deps.queue.current()
    if (!current) return

    const refreshed: Track[] = []
    for (const track of this.deps.queue.getTracks()) {
      const found = this.findTrackById(track.id)
      if (found) refreshed.push(found)
    }

    const index = refreshed.findIndex((track) => track.id === current.id)
    if (index < 0) {
      this.resetPlayback()
      return
    }

    this.deps.queue.setQueue(refreshed, index)
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
      engine.on('play', () => this.deps.updateControls()),
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
    if (!queue.current()) return

    if (engine.getPosition() > 3) {
      engine.seek(0)
      this.deps.syncTime(0)
      return
    }

    if (queue.hasPrevious()) {
      queue.previous()
      this.startCurrentTrack(true)
      return
    }

    engine.seek(0)
    this.deps.syncTime(0)
  }

  private togglePlayPause(): void {
    const { engine, queue } = this.deps
    if (!queue.current()) return

    if (engine.isPlaying()) {
      engine.pause()
      return
    }

    this.resumeCurrentTrack()
  }

  private next(): void {
    if (!this.deps.queue.hasNext()) return
    this.deps.queue.next()
    this.startCurrentTrack(true)
  }

  private resumeCurrentTrack(): void {
    const { engine, queue } = this.deps
    const track = queue.current()
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

  private handlePlaybackFailure(attempt: PlaybackAttempt, error: unknown): void {
    if (this.activeAttempt !== attempt || attempt.failed) return

    // Pausing interrupts an in-flight play() promise. That is not a track failure.
    if (error instanceof Error && error.name === 'AbortError') return

    attempt.failed = true

    const track = this.deps.queue.current()
    console.error(`[renderer] Could not play ${track?.title ?? 'track'}`, error)
    this.deps.setStatus(track ? `Could not play ${track.title}.` : 'Could not play this file.')

    if (this.deps.queue.hasNext()) {
      this.deps.queue.next()
      this.startCurrentTrack(true)
      return
    }

    this.deps.engine.pause()
    this.deps.updateControls()
  }

  private handleEnded(): void {
    if (this.deps.queue.hasNext()) {
      this.deps.queue.next()
      this.startCurrentTrack(true)
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

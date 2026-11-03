import type { Track } from '../../shared/types'

export interface PlaybackEvents {
  ended: void
  timeupdate: number
  error: Error
  play: void
  pause: void
  loadedmetadata: number
}

export type PlaybackEventName = keyof PlaybackEvents

export interface PlaybackEngine {
  load(track: Track): void
  play(): Promise<void>
  pause(): void
  seek(seconds: number): void
  setVolume(volume: number): void
  getPosition(): number
  getDuration(): number
  isPlaying(): boolean
  on<K extends PlaybackEventName>(
    event: K,
    listener: (payload: PlaybackEvents[K]) => void
  ): () => void
}

type ListenerMap = {
  [K in PlaybackEventName]: Set<(payload: PlaybackEvents[K]) => void>
}

/** Single-element backend that can be replaced by another PlaybackEngine later. */
export class HtmlAudioEngine implements PlaybackEngine {
  private readonly audio: HTMLAudioElement
  private readonly listeners: ListenerMap = {
    ended: new Set(),
    timeupdate: new Set(),
    error: new Set(),
    play: new Set(),
    pause: new Set(),
    loadedmetadata: new Set()
  }

  constructor(audio: HTMLAudioElement) {
    this.audio = audio

    audio.addEventListener('ended', () => this.emit('ended', undefined))
    audio.addEventListener('timeupdate', () => this.emit('timeupdate', this.getPosition()))
    audio.addEventListener('error', () => {
      // A stale event from a replaced source has no media error attached.
      const mediaError = audio.error
      if (!mediaError) return
      this.emit('error', new Error(mediaError.message || 'Audio playback failed'))
    })
    audio.addEventListener('play', () => this.emit('play', undefined))
    audio.addEventListener('pause', () => this.emit('pause', undefined))
    audio.addEventListener('loadedmetadata', () =>
      this.emit('loadedmetadata', this.getDuration())
    )
  }

  load(track: Track): void {
    this.audio.src = track.url
  }

  play(): Promise<void> {
    return this.audio.play()
  }

  pause(): void {
    this.audio.pause()
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return
    this.audio.currentTime = Math.max(0, seconds)
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return
    this.audio.volume = Math.min(1, Math.max(0, volume))
  }

  getPosition(): number {
    return Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0
  }

  getDuration(): number {
    const duration = this.audio.duration
    return Number.isFinite(duration) && duration > 0 ? duration : 0
  }

  isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended
  }

  on<K extends PlaybackEventName>(
    event: K,
    listener: (payload: PlaybackEvents[K]) => void
  ): () => void {
    const listeners = this.listeners[event] as Set<(payload: PlaybackEvents[K]) => void>
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  private emit<K extends PlaybackEventName>(event: K, payload: PlaybackEvents[K]): void {
    const listeners = this.listeners[event] as Set<(payload: PlaybackEvents[K]) => void>
    for (const listener of listeners) listener(payload)
  }
}

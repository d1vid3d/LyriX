import type { Track } from '../../shared/types'

/** Ordered track list with a movable current index. No playback or DOM concerns. */
export class PlaybackQueue {
  private tracks: Track[] = []
  private index = -1

  setQueue(tracks: readonly Track[], startIndex = 0): Track | null {
    this.tracks = [...tracks]

    if (this.tracks.length === 0) {
      this.index = -1
      return null
    }

    const requested = Number.isFinite(startIndex) ? Math.trunc(startIndex) : 0
    this.index = Math.min(Math.max(requested, 0), this.tracks.length - 1)
    return this.current()
  }

  current(): Track | null {
    if (this.index < 0) return null
    return this.tracks[this.index] ?? null
  }

  next(): Track | null {
    if (!this.hasNext()) return null
    this.index += 1
    return this.current()
  }

  previous(): Track | null {
    if (!this.hasPrevious()) return null
    this.index -= 1
    return this.current()
  }

  hasNext(): boolean {
    return this.index >= 0 && this.index < this.tracks.length - 1
  }

  hasPrevious(): boolean {
    return this.index > 0
  }

  getTracks(): readonly Track[] {
    return this.tracks
  }

  getCurrentIndex(): number {
    return this.index
  }
}

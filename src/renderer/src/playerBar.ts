import type { Album, Track } from '../../shared/types'
import type { AppElements } from './dom'
import { formatTime, setCoverImage, smallCoverUrl } from './format'

export interface PlayerBarDeps {
  elements: AppElements
  getCurrentTrack(): Track | null
  getAlbumForTrack(track: Track): Album | null
  hasNext(): boolean
  isPlaying(): boolean
}

/** Bottom player bar: now-playing text/cover, transport enabled states, and time labels. */
export class PlayerBar {
  private readonly deps: PlayerBarDeps

  constructor(deps: PlayerBarDeps) {
    this.deps = deps
  }

  updateControls(): void {
    const { elements } = this.deps
    const hasCurrent = this.deps.getCurrentTrack() !== null
    const playing = this.deps.isPlaying()

    const playLabel = playing ? 'Pause' : 'Play'
    elements.playPauseButton.dataset.playing = String(playing)
    elements.playPauseButton.setAttribute('aria-label', playLabel)
    elements.playPauseButton.title = playLabel
    elements.playPauseButton.disabled = !hasCurrent
    elements.previousButton.disabled = !hasCurrent
    elements.nextButton.disabled = !this.deps.hasNext()
  }

  updateDuration(duration: number): void {
    const { durationLabel, seekBar } = this.deps.elements
    if (!Number.isFinite(duration) || duration <= 0) {
      durationLabel.textContent = '0:00'
      seekBar.max = '0'
      seekBar.disabled = true
      return
    }

    durationLabel.textContent = formatTime(duration)
    seekBar.max = String(duration)
    seekBar.disabled = false
  }

  syncTime(time: number): void {
    this.deps.elements.seekBar.value = String(time)
    this.deps.elements.currentTimeLabel.textContent = formatTime(time)
  }

  resetTime(): void {
    const { seekBar, currentTimeLabel, durationLabel } = this.deps.elements
    seekBar.value = '0'
    seekBar.max = '0'
    seekBar.disabled = true
    currentTimeLabel.textContent = '0:00'
    durationLabel.textContent = '0:00'
  }

  updateNowPlaying(): void {
    const { elements } = this.deps
    const track = this.deps.getCurrentTrack()

    if (!track) {
      elements.nowTitle.textContent = 'Nothing playing'
      elements.nowArtist.textContent = ''
      setCoverImage(elements.nowCoverImage, null, '')
      return
    }

    const album = this.deps.getAlbumForTrack(track)
    elements.nowTitle.textContent = track.title
    elements.nowArtist.textContent = track.artist
    setCoverImage(
      elements.nowCoverImage,
      album ? smallCoverUrl(album.coverUrl) : null,
      album ? `${album.title} cover` : ''
    )
  }
}

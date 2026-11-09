import type { Album, Track } from '../../shared/types'
import type { QueueSnapshot, RepeatMode } from '../player/queue'
import { createFavoriteButton, updateFavoriteButton } from '../ui/favoriteButton'
import type { AppElements } from './dom'
import { formatTime, setCoverImage, smallCoverUrl } from './format'

export interface PlayerBarDeps {
  elements: AppElements
  getCurrentTrack(): Track | null
  getAlbumForTrack(track: Track): Album | null
  getQueueSnapshot(): QueueSnapshot
  canGoNext(): boolean
  canGoPrevious(): boolean
  isPlaying(): boolean
  toggleShuffle(): void
  cycleRepeat(): void
  isQueuePanelOpen(): boolean
  toggleQueuePanel(): void
  isFavorite(trackId: string): boolean
  onToggleFavorite(trackId: string): void
}

function repeatLabel(repeat: RepeatMode): string {
  return `Repeat: ${repeat}`
}

/** Bottom player bar: now-playing text/cover, transport enabled states, and time labels. */
export class PlayerBar {
  private readonly deps: PlayerBarDeps

  constructor(deps: PlayerBarDeps) {
    this.deps = deps
    deps.elements.shuffleButton.addEventListener('click', () => this.deps.toggleShuffle())
    deps.elements.repeatButton.addEventListener('click', () => this.deps.cycleRepeat())
    deps.elements.queueToggleButton.addEventListener('click', () =>
      this.deps.toggleQueuePanel()
    )
  }

  updateControls(): void {
    const { elements } = this.deps
    const hasCurrent = this.deps.getCurrentTrack() !== null
    const playing = this.deps.isPlaying()
    const snapshot = this.deps.getQueueSnapshot()
    const queueOpen = this.deps.isQueuePanelOpen()

    const playLabel = playing ? 'Pause' : 'Play'
    elements.playPauseButton.dataset.playing = String(playing)
    elements.playPauseButton.setAttribute('aria-label', playLabel)
    elements.playPauseButton.title = playLabel
    elements.playPauseButton.disabled = !hasCurrent
    elements.previousButton.disabled = !this.deps.canGoPrevious()
    elements.nextButton.disabled = !this.deps.canGoNext()

    const shuffleLabel = `Shuffle: ${snapshot.shuffle ? 'on' : 'off'}`
    elements.shuffleButton.setAttribute('aria-pressed', String(snapshot.shuffle))
    elements.shuffleButton.setAttribute('aria-label', shuffleLabel)
    elements.shuffleButton.title = shuffleLabel

    const repeatStateLabel = repeatLabel(snapshot.repeat)
    elements.repeatButton.setAttribute('aria-pressed', String(snapshot.repeat !== 'off'))
    elements.repeatButton.setAttribute('aria-label', repeatStateLabel)
    elements.repeatButton.title = repeatStateLabel
    elements.repeatButton.dataset.repeat = snapshot.repeat

    elements.queueToggleButton.setAttribute('aria-pressed', String(queueOpen))
    elements.queueToggleButton.setAttribute('aria-expanded', String(queueOpen))
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
      elements.favoriteCurrentHost.replaceChildren()
      setCoverImage(elements.nowCoverImage, null, '')
      return
    }

    const album = this.deps.getAlbumForTrack(track)
    elements.nowTitle.textContent = track.title
    elements.nowArtist.textContent = track.artist
    this.renderFavorite(track)
    setCoverImage(
      elements.nowCoverImage,
      album ? smallCoverUrl(album.coverUrl) : null,
      album ? `${album.title} cover` : ''
    )
  }

  private renderFavorite(track: Track): void {
    const host = this.deps.elements.favoriteCurrentHost
    const existing = host.querySelector<HTMLButtonElement>('[data-favorite-track-id]')
    if (existing?.dataset.favoriteTrackId === track.id) {
      updateFavoriteButton(existing, this.deps.isFavorite(track.id))
      return
    }

    host.replaceChildren(
      createFavoriteButton(track.id, this.deps.isFavorite(track.id), (trackId) =>
        this.deps.onToggleFavorite(trackId)
      )
    )
  }
}

import type { LyricDocument } from '../../shared/lyrics'
import type { Album, Track } from '../../shared/types'
import type { LyricsState } from '../lyrics/lyricsController'
import type { AppElements } from './dom'
import { setCoverImage } from './format'

export interface LyricViewLike {
  setDocument(doc: LyricDocument): void
  start(): void
  stop(): void
  showMessage(message: string): void
}

export interface NowPlayingDeps {
  elements: AppElements
  getCurrentTrack(): Track | null
  getAlbumForTrack(track: Track): Album | null
  lyricsState(): LyricsState
  subscribeLyrics(listener: (state: LyricsState) => void): () => void
  lyricView: LyricViewLike
  showSection(section: HTMLElement): void
  currentSection(): HTMLElement
  refreshScreen(): void
  renderNowPlaying(): void
}

/** Owns the Now Playing section lifecycle and its lyric subscription. */
export class NowPlayingController {
  private readonly deps: NowPlayingDeps
  private open = false
  private dirty = false

  constructor(deps: NowPlayingDeps) {
    this.deps = deps

    deps.elements.nowPlayingTarget.addEventListener('click', () => this.openNowPlaying())
    deps.elements.nowPlayingTarget.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        this.openNowPlaying()
      }
    })
    deps.elements.nowPlayingCloseButton.addEventListener('click', () => this.closeNowPlaying())
  }

  isOpen(): boolean {
    return this.open
  }

  markDirty(): void {
    if (this.open) this.dirty = true
  }

  updateContent(): void {
    const { elements } = this.deps
    const track = this.deps.getCurrentTrack()

    if (!track) {
      elements.nowPlayingTitle.textContent = 'Nothing playing'
      elements.nowPlayingArtist.textContent = ''
      elements.nowPlayingAlbum.textContent = ''
      setCoverImage(elements.nowPlayingCoverImage, null, '')
      return
    }

    const album = this.deps.getAlbumForTrack(track)
    elements.nowPlayingTitle.textContent = track.title
    elements.nowPlayingArtist.textContent = track.artist
    elements.nowPlayingAlbum.textContent = track.album
    setCoverImage(
      elements.nowPlayingCoverImage,
      album ? album.coverUrl : null,
      album ? `${album.title} cover` : ''
    )
  }

  openNowPlaying(): void {
    if (this.open || !this.deps.getCurrentTrack()) return

    this.open = true
    this.deps.renderNowPlaying()
    this.deps.showSection(this.deps.elements.nowPlayingSection)
    this.renderLyricsState(this.deps.lyricsState())
  }

  closeNowPlaying(): void {
    if (!this.open) return

    this.open = false
    this.deps.lyricView.stop()

    if (this.dirty) {
      this.dirty = false
      this.deps.refreshScreen()
      return
    }

    this.deps.showSection(this.deps.currentSection())
  }

  /** Close Now Playing for an action that will render another view itself. */
  leaveForNavigation(): void {
    if (!this.open) return

    this.open = false
    this.dirty = false
    this.deps.lyricView.stop()
  }

  handleLyricsState(state: LyricsState): void {
    if (this.open) this.renderLyricsState(state)
  }

  /** Subscribes to lyric state; returns the unsubscribe function. */
  start(): () => void {
    return this.deps.subscribeLyrics((state) => this.handleLyricsState(state))
  }

  private renderLyricsState(state: LyricsState): void {
    if (state.status === 'ready' && state.doc) {
      this.deps.lyricView.setDocument(state.doc)
      this.deps.lyricView.start()
      return
    }

    this.deps.lyricView.stop()
    this.deps.lyricView.showMessage(
      state.status === 'loading' ? 'Loading lyrics…' : 'No lyrics found'
    )
  }
}

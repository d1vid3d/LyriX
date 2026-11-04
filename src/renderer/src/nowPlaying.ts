import type { LyricDocument } from '../../shared/lyrics'
import type { LyricPreference } from '../../shared/lyrics/sources'
import type { Album, Track } from '../../shared/types'
import type { LyricsState } from '../lyrics/lyricsController'
import { buildSourceMenuModel } from '../lyrics/sourceMenuModel'
import type { SourceMenuModel } from '../lyrics/sourceMenuModel'
import { LyricSourceMenu } from '../ui/lyricSourceMenu'
import { TranslationToggle } from '../ui/translationToggle'
import type { AppElements } from './dom'
import { setCoverImage } from './format'

export interface LyricViewLike {
  setDocument(
    doc: LyricDocument,
    translationKey?: string | null,
    translationVariant?: string | null
  ): void
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
  selectLyricSource(sourceId: string | null): void
  setLyricPreference(preference: LyricPreference): void
  setTranslationEnabled(enabled: boolean): void
  selectTranslation(id: string | null): void
  reloadLyrics(): void
  lyricView: LyricViewLike
  showSection(section: HTMLElement): void
  currentSection(): HTMLElement
  refreshScreen(): void
  renderNowPlaying(): void
}

/** Owns the Now Playing section lifecycle, its lyric subscription, and the source menu. */
export class NowPlayingController {
  private readonly deps: NowPlayingDeps
  private readonly menu: LyricSourceMenu
  private readonly translationToggle: TranslationToggle
  private open = false
  private dirty = false

  constructor(deps: NowPlayingDeps) {
    this.deps = deps
    this.menu = new LyricSourceMenu(deps.elements.lyricSourceMenu, {
      onSelect: (sourceId) => deps.selectLyricSource(sourceId),
      onPreference: (preference) => deps.setLyricPreference(preference),
      onTranslationToggle: (enabled) => deps.setTranslationEnabled(enabled),
      onTranslationSelect: (id) => deps.selectTranslation(id),
      onReload: () => deps.reloadLyrics()
    })
    this.translationToggle = new TranslationToggle(deps.elements.translationToggle, {
      onToggle: (enabled) => deps.setTranslationEnabled(enabled)
    })

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
    this.applyLyricsState(this.deps.lyricsState())
  }

  closeNowPlaying(): void {
    if (!this.open) return

    this.open = false
    this.menu.close()
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
    this.menu.close()
    this.deps.lyricView.stop()
  }

  handleLyricsState(state: LyricsState): void {
    this.applyLyricsState(state)
  }

  /** Subscribes to lyric state; returns the unsubscribe function. */
  start(): () => void {
    return this.deps.subscribeLyrics((state) => this.handleLyricsState(state))
  }

  destroy(): void {
    this.menu.close()
    this.menu.destroy()
    this.translationToggle.destroy()
  }

  private applyLyricsState(state: LyricsState): void {
    const model = buildSourceMenuModel(state)
    this.menu.update(model)
    this.translationToggle.update(model.translationToggle)

    if (this.open) this.renderLyricsState(state, model)
  }

  private renderLyricsState(state: LyricsState, model: SourceMenuModel): void {
    if (state.status === 'ready' && state.doc) {
      const selected = state.translation.key
        ? state.translation.options.find(
            (option) => option.option.id === state.translation.key
          )
        : undefined

      this.deps.lyricView.setDocument(
        state.doc,
        state.translation.key,
        selected?.option.variant ?? null
      )
      this.deps.lyricView.start()
      return
    }

    this.deps.lyricView.stop()
    this.deps.lyricView.showMessage(
      state.status === 'loading' ? model.loadingMessage : model.emptyState.text
    )
  }
}

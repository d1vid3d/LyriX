import type { Album, Track } from '../../shared/types'
import { queryLibrary } from '../library/query'
import type { LibraryIndex, LibraryView } from '../library/query'
import type { AppElements } from './dom'
import type { DetailRoute } from './routeStack'
import { renderAlbumDetail } from './views/albumDetail'
import { renderAlbumGrid } from './views/albumGrid'
import { renderArtistDetail } from './views/artistDetail'
import { renderArtistList } from './views/artistList'
import type { TracksList } from './views/tracksList'

export interface NavigationReader {
  getActiveView(): LibraryView
  getDetail(): DetailRoute | null
  showSection(section: HTMLElement): void
  currentSection(): HTMLElement
  popRoute(): void
  backLabel(): string
}

export interface ScreenDeps {
  elements: AppElements
  navigation: NavigationReader
  tracksList: TracksList
  isNowPlayingOpen(): boolean
  getLibraryIndex(): LibraryIndex
  getAlbums(): readonly Album[]
  getAppliedSearch(): string
  getSort(view: LibraryView): string
  emptyMessage(): string
  getCurrentTrackId(): string | null
  onOpenAlbum(albumId: string): void
  onOpenArtist(artistName: string): void
  onPlayTrack(index: number): void
  onPlayAlbumTrack(album: Album, track: Track): void
  syncViewControls(): void
}

/** Chooses the visible section and renders library views and detail views. */
export class ScreenController {
  private readonly deps: ScreenDeps

  constructor(deps: ScreenDeps) {
    this.deps = deps
  }

  refresh(): void {
    this.deps.syncViewControls()

    // Keep the library DOM untouched while Now Playing is open so closing restores scroll.
    if (this.deps.isNowPlayingOpen()) {
      this.deps.navigation.showSection(this.deps.elements.nowPlayingSection)
      return
    }

    const detail = this.deps.navigation.getDetail()
    if (detail) {
      // Keep the hidden list ready so Back restores it with search and sort applied.
      this.renderLibraryView(this.deps.navigation.getActiveView())

      if (detail.kind === 'album') {
        this.deps.navigation.showSection(this.deps.elements.detailView)
        this.renderAlbumDetail(detail.albumId)
      } else {
        this.deps.navigation.showSection(this.deps.elements.artistDetailView)
        this.renderArtistDetail(detail.artistName)
      }
      return
    }

    this.deps.navigation.showSection(this.deps.navigation.currentSection())
    this.renderLibraryView(this.deps.navigation.getActiveView())
  }

  renderLibraryView(view: LibraryView): void {
    const index = this.deps.getLibraryIndex()
    const search = this.deps.getAppliedSearch()

    if (view === 'albums') {
      renderAlbumGrid(
        {
          container: this.deps.elements.albumGrid,
          emptyState: this.deps.elements.emptyState,
          emptyMessage: () => this.deps.emptyMessage(),
          onOpenAlbum: (albumId) => this.deps.onOpenAlbum(albumId)
        },
        queryLibrary(index, { view: 'albums', search, sort: this.deps.getSort('albums') })
      )
      return
    }

    if (view === 'artists') {
      renderArtistList(
        {
          list: this.deps.elements.artistList,
          empty: this.deps.elements.artistsEmpty,
          emptyMessage: () => this.deps.emptyMessage(),
          onOpenArtist: (artistName) => this.deps.onOpenArtist(artistName)
        },
        queryLibrary(index, { view: 'artists', search, sort: this.deps.getSort('artists') })
      )
      return
    }

    this.deps.tracksList.render(
      queryLibrary(index, { view: 'tracks', search, sort: this.deps.getSort('tracks') })
    )
  }

  updateTrackHighlight(): void {
    const currentId = this.deps.getCurrentTrackId()

    for (const button of this.deps.elements.trackList.querySelectorAll<HTMLButtonElement>('.track')) {
      const isCurrent = button.dataset.trackId === currentId
      button.classList.toggle('playing', isCurrent)
      if (isCurrent) {
        button.setAttribute('aria-current', 'true')
      } else {
        button.removeAttribute('aria-current')
      }
    }

    this.deps.tracksList.refreshHighlight()
  }

  private renderAlbumDetail(albumId: string): void {
    const album = this.deps.getAlbums().find((item) => item.id === albumId)
    if (!album) {
      this.deps.navigation.popRoute()
      this.refresh()
      return
    }

    renderAlbumDetail(
      {
        backButton: this.deps.elements.backButton,
        coverImage: this.deps.elements.detailCoverImage,
        title: this.deps.elements.detailTitle,
        artist: this.deps.elements.detailArtist,
        year: this.deps.elements.detailYear,
        trackList: this.deps.elements.trackList,
        backLabel: () => this.deps.navigation.backLabel(),
        getCurrentTrackId: () => this.deps.getCurrentTrackId(),
        onPlayTrack: (albumItem, track) => this.deps.onPlayAlbumTrack(albumItem, track)
      },
      album
    )
  }

  private renderArtistDetail(artistName: string): void {
    const artist = this.deps
      .getLibraryIndex()
      .items.artists.find((item) => item.name === artistName)
    if (!artist) {
      this.deps.navigation.popRoute()
      this.refresh()
      return
    }

    renderArtistDetail(
      {
        backButton: this.deps.elements.artistBackButton,
        name: this.deps.elements.artistNameLabel,
        meta: this.deps.elements.artistMetaLabel,
        albumGrid: this.deps.elements.artistAlbumGrid,
        onOpenAlbum: (albumId) => this.deps.onOpenAlbum(albumId)
      },
      artist
    )
  }
}

import type { Album, Track } from '../../shared/types'
import { queryLibrary } from '../library/query'
import type { ArtistItem, LibraryIndex, LibraryView, TrackItem } from '../library/query'
import type { MenuPosition } from '../ui/contextMenu'
import type { AppElements } from './dom'
import type { DetailRoute } from './routeStack'
import { renderAlbumDetail } from './views/albumDetail'
import { renderAlbumGrid } from './views/albumGrid'
import { renderArtistDetail } from './views/artistDetail'
import { renderArtistList } from './views/artistList'
import type { FavoritesView } from './views/favoritesView'
import type { RecentView } from './views/recentView'
import type { TracksList } from './views/tracksList'
import type { FavoritesControllerState } from '../favorites/favoritesController'
import type { FavoritesStatusModel } from '../favorites/favoritesStatusModel'
import type { HistoryControllerState } from '../history/historyController'
import type { HistoryEmptyModel, HistoryStatusModel } from '../history/historyStatusModel'

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
  favoritesList: TracksList
  favoritesView: FavoritesView
  recentList: TracksList
  recentView: RecentView
  getFavoritesState(): FavoritesControllerState
  getFavoritesStatus(): FavoritesStatusModel
  getHistoryState(): HistoryControllerState
  getHistoryStatus(): HistoryStatusModel
  getHistoryEmpty(): HistoryEmptyModel | null
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
  onPlayAlbum(album: Album): void
  onShuffleAlbum(album: Album): void
  onPlayArtist(artist: ArtistItem): void
  onShuffleArtist(artist: ArtistItem): void
  onOpenAlbumMenu(album: Album, position: MenuPosition): void
  onOpenArtistMenu(artist: ArtistItem, position: MenuPosition): void
  onOpenTrackRowMenu(item: TrackItem, index: number, play: () => void, position: MenuPosition): void
  onOpenAlbumTrackMenu(album: Album, track: Track, play: () => void, position: MenuPosition): void
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
    this.renderView(view, false)
  }

  /** Re-renders only the Favorites view after a favorites/status change, keeping scroll. */
  refreshFavoritesView(): void {
    if (this.deps.navigation.getActiveView() !== 'favorites') return
    this.renderView('favorites', true)
  }

  /** Re-renders only the Recently played view after a history change, keeping scroll. */
  refreshRecentView(): void {
    if (this.deps.navigation.getActiveView() !== 'recent') return
    this.renderView('recent', true)
  }

  private renderView(view: LibraryView, preserveFavoritesScroll: boolean): void {
    const index = this.deps.getLibraryIndex()
    const search = this.deps.getAppliedSearch()

    if (view === 'albums') {
      renderAlbumGrid(
        {
          container: this.deps.elements.albumGrid,
          emptyState: this.deps.elements.emptyState,
          emptyMessage: () => this.deps.emptyMessage(),
          onOpenAlbum: (albumId) => this.deps.onOpenAlbum(albumId),
          onOpenAlbumMenu: (album, position) => this.deps.onOpenAlbumMenu(album, position)
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
          onOpenArtist: (artistName) => this.deps.onOpenArtist(artistName),
          onOpenArtistMenu: (artist, position) => this.deps.onOpenArtistMenu(artist, position)
        },
        queryLibrary(index, { view: 'artists', search, sort: this.deps.getSort('artists') })
      )
      return
    }

    if (view === 'favorites') {
      const items = queryLibrary(index, {
        view: 'favorites',
        search,
        sort: this.deps.getSort('favorites')
      })
      const favorites = this.deps.getFavoritesState()
      this.deps.favoritesView.render(
        this.deps.getFavoritesStatus(),
        favorites.missing,
        items.length > 0
      )
      this.deps.favoritesList.render(items, { preserveScroll: preserveFavoritesScroll })
      return
    }

    if (view === 'recent') {
      const items = queryLibrary(index, {
        view: 'recent',
        search,
        sort: this.deps.getSort('recent')
      })
      const history = this.deps.getHistoryState()
      this.deps.recentView.render(
        this.deps.getHistoryStatus(),
        this.deps.getHistoryEmpty(),
        history.recording,
        items.length > 0
      )
      this.deps.recentList.render(items, { preserveScroll: preserveFavoritesScroll })
      return
    }

    this.deps.tracksList.render(
      queryLibrary(index, { view: 'tracks', search, sort: this.deps.getSort('tracks') })
    )
  }

  updateTrackHighlight(): void {
    const currentId = this.deps.getCurrentTrackId()

    for (const button of this.deps.elements.trackList.querySelectorAll<HTMLButtonElement>(
      '.track'
    )) {
      const isCurrent = button.dataset.trackId === currentId
      button.classList.toggle('playing', isCurrent)
      if (isCurrent) {
        button.setAttribute('aria-current', 'true')
      } else {
        button.removeAttribute('aria-current')
      }
    }

    this.deps.tracksList.refreshHighlight()
    this.deps.favoritesList.refreshHighlight()
    this.deps.recentList.refreshHighlight()
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
        playButton: this.deps.elements.albumPlayButton,
        shuffleButton: this.deps.elements.albumShuffleButton,
        trackList: this.deps.elements.trackList,
        backLabel: () => this.deps.navigation.backLabel(),
        getCurrentTrackId: () => this.deps.getCurrentTrackId(),
        onPlayTrack: (albumItem, track) => this.deps.onPlayAlbumTrack(albumItem, track),
        onOpenTrackMenu: (albumItem, track, play, position) =>
          this.deps.onOpenAlbumTrackMenu(albumItem, track, play, position),
        onPlayAlbum: (albumItem) => this.deps.onPlayAlbum(albumItem),
        onShuffleAlbum: (albumItem) => this.deps.onShuffleAlbum(albumItem)
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
        playButton: this.deps.elements.artistPlayButton,
        shuffleButton: this.deps.elements.artistShuffleButton,
        albumGrid: this.deps.elements.artistAlbumGrid,
        onOpenAlbum: (albumId) => this.deps.onOpenAlbum(albumId),
        onOpenAlbumMenu: (albumItem, position) => this.deps.onOpenAlbumMenu(albumItem, position),
        onPlayArtist: (artistItem) => this.deps.onPlayArtist(artistItem),
        onShuffleArtist: (artistItem) => this.deps.onShuffleArtist(artistItem)
      },
      artist
    )
  }
}

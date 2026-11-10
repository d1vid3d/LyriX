import type { LibraryView } from '../library/query'
import type { AppElements } from './dom'
import {
  backLabel as routeBackLabel,
  popRoute,
  pruneRoutes,
  pushRoute,
  topRoute
} from './routeStack'
import type { DetailRoute } from './routeStack'

export interface NavigationDeps {
  elements: AppElements
  refresh(): void
  leaveNowPlaying(): void
  closeNowPlaying(): void
  clearPendingSearch(): void
  getSearchValue(): string
  setAppliedSearch(value: string): void
  saveUiState(): void
}

/** Owns the active library view and the detail route stack. */
export class NavigationController {
  private readonly deps: NavigationDeps
  private activeView: LibraryView = 'albums'
  private detailStack: DetailRoute[] = []

  constructor(deps: NavigationDeps) {
    this.deps = deps
    deps.elements.backButton.addEventListener('click', () => this.goBack())
    deps.elements.artistBackButton.addEventListener('click', () => this.goBack())
  }

  getActiveView(): LibraryView {
    return this.activeView
  }

  setActiveView(view: LibraryView): void {
    this.activeView = view
  }

  getDetail(): DetailRoute | null {
    return topRoute(this.detailStack)
  }

  showSection(section: HTMLElement): void {
    for (const view of [
      this.deps.elements.gridView,
      this.deps.elements.artistsView,
      this.deps.elements.tracksView,
      this.deps.elements.favoritesView,
      this.deps.elements.recentView,
      this.deps.elements.detailView,
      this.deps.elements.artistDetailView,
      this.deps.elements.nowPlayingSection
    ]) {
      view.hidden = view !== section
    }
  }

  currentSection(): HTMLElement {
    const detail = this.getDetail()
    if (detail) {
      return detail.kind === 'album'
        ? this.deps.elements.detailView
        : this.deps.elements.artistDetailView
    }

    if (this.activeView === 'albums') return this.deps.elements.gridView
    if (this.activeView === 'artists') return this.deps.elements.artistsView
    if (this.activeView === 'favorites') return this.deps.elements.favoritesView
    if (this.activeView === 'recent') return this.deps.elements.recentView
    return this.deps.elements.tracksView
  }

  openAlbum(albumId: string): void {
    this.deps.leaveNowPlaying()
    this.detailStack = pushRoute(this.detailStack, { kind: 'album', albumId })
    this.deps.refresh()
  }

  openArtist(artistName: string): void {
    this.deps.leaveNowPlaying()
    this.detailStack = pushRoute(this.detailStack, { kind: 'artist', artistName })
    this.deps.refresh()
  }

  goBack(): void {
    this.deps.leaveNowPlaying()
    this.detailStack = popRoute(this.detailStack)
    this.deps.refresh()
  }

  switchView(view: LibraryView): void {
    if (this.activeView === view && this.detailStack.length === 0) {
      this.deps.closeNowPlaying()
      return
    }

    this.deps.leaveNowPlaying()
    this.deps.clearPendingSearch()

    this.activeView = view
    this.detailStack = []
    this.deps.setAppliedSearch(this.deps.getSearchValue())
    this.deps.refresh()
    this.deps.saveUiState()
  }

  popRoute(): void {
    this.detailStack = popRoute(this.detailStack)
  }

  resetStack(): void {
    this.detailStack = []
  }

  pruneInvalidRoutes(isValid: (route: DetailRoute) => boolean): void {
    this.detailStack = pruneRoutes(this.detailStack, isValid)
  }

  backLabel(): string {
    return routeBackLabel(this.activeView, this.detailStack)
  }
}

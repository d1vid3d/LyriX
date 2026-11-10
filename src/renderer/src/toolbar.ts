import type { Settings, UiState } from '../../shared/types'
import {
  getDefaultSort,
  getSortOptions,
  getViewIds,
  isLibraryView,
  isSortKey
} from '../library/query'
import type { LibraryView } from '../library/query'
import type { AppElements } from './dom'

export interface ToolbarDeps {
  elements: AppElements
  getActiveView(): LibraryView
  setActiveView(view: LibraryView): void
  switchView(view: LibraryView): void
  isNowPlayingOpen(): boolean
  leaveNowPlaying(): void
  showCurrentSection(): void
  renderLibraryView(view: LibraryView): void
  saveUiState(): void
}

/** Search box, sort dropdown, view switcher, and keyboard shortcuts. */
export class ToolbarController {
  private readonly deps: ToolbarDeps
  private readonly sortByView: Record<LibraryView, string> = {
    albums: getDefaultSort('albums'),
    artists: getDefaultSort('artists'),
    tracks: getDefaultSort('tracks'),
    favorites: getDefaultSort('favorites'),
    recent: getDefaultSort('recent')
  }
  private appliedSearch = ''
  private searchTimer: ReturnType<typeof setTimeout> | null = null

  constructor(deps: ToolbarDeps) {
    this.deps = deps

    for (const button of deps.elements.viewButtons) {
      button.addEventListener('click', () => {
        const view = button.dataset.view
        if (isLibraryView(view)) deps.switchView(view)
      })
    }

    deps.elements.sortSelect.addEventListener('change', () => {
      const sort = deps.elements.sortSelect.value
      const view = deps.getActiveView()
      if (!isSortKey(view, sort)) return

      this.sortByView[view] = sort
      deps.renderLibraryView(view)
      deps.saveUiState()
    })

    deps.elements.searchInput.addEventListener('input', () => {
      if (this.searchTimer !== null) clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => {
        this.searchTimer = null
        this.applySearch(deps.elements.searchInput.value)
      }, 150)
    })
  }

  getAppliedSearch(): string {
    return this.appliedSearch
  }

  getSort(view: LibraryView): string {
    return this.sortByView[view]
  }

  setAppliedSearch(value: string): void {
    this.appliedSearch = value
  }

  clearPendingSearch(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
  }

  currentUiState(): UiState {
    return {
      lastView: this.deps.getActiveView(),
      sortByView: { ...this.sortByView }
    }
  }

  applyUiSettings(settings: Settings): void {
    this.deps.setActiveView(isLibraryView(settings.lastView) ? settings.lastView : 'albums')

    for (const view of getViewIds()) {
      const savedSort = settings.sortByView[view]
      this.sortByView[view] = isSortKey(view, savedSort) ? savedSort : getDefaultSort(view)
    }

    this.syncViewControls()
  }

  syncViewControls(): void {
    const { elements } = this.deps
    const activeView = this.deps.getActiveView()

    for (const button of elements.viewButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.view === activeView))
    }

    const fragment = document.createDocumentFragment()
    for (const option of getSortOptions(activeView)) {
      const element = document.createElement('option')
      element.value = option.key
      element.textContent = option.label
      fragment.append(element)
    }
    elements.sortSelect.replaceChildren(fragment)
    elements.sortSelect.value = this.sortByView[activeView]
  }

  applySearch(search: string): void {
    const wasNowPlaying = this.deps.isNowPlayingOpen()
    if (wasNowPlaying) this.deps.leaveNowPlaying()

    this.appliedSearch = search
    this.deps.renderLibraryView(this.deps.getActiveView())

    if (wasNowPlaying) this.deps.showCurrentSection()
  }

  /** Shortcut handler entry point; behavior matches the old Ctrl+F / `/` handler. */
  focusSearch(): void {
    const input = this.deps.elements.searchInput
    input.focus()
    input.select()
  }

  clearSearch(): void {
    this.clearPendingSearch()
    this.deps.elements.searchInput.value = ''
    this.deps.elements.searchInput.blur()
    this.applySearch('')
  }

  dispose(): void {
    this.clearPendingSearch()
  }
}

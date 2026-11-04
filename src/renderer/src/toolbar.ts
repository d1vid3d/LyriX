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
  closeNowPlaying(): void
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
    tracks: getDefaultSort('tracks')
  }
  private appliedSearch = ''
  private searchTimer: ReturnType<typeof setTimeout> | null = null
  private readonly handleKeydown = (event: KeyboardEvent): void => this.onKeydown(event)

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

    window.addEventListener('keydown', this.handleKeydown)
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

  clearSearch(): void {
    this.clearPendingSearch()
    this.deps.elements.searchInput.value = ''
    this.deps.elements.searchInput.blur()
    this.applySearch('')
  }

  dispose(): void {
    this.clearPendingSearch()
    window.removeEventListener('keydown', this.handleKeydown)
  }

  private onKeydown(event: KeyboardEvent): void {
    const { elements } = this.deps

    if (event.key === 'Escape' && this.deps.isNowPlayingOpen()) {
      event.preventDefault()
      this.deps.closeNowPlaying()
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      elements.searchInput.focus()
      elements.searchInput.select()
      return
    }

    if (
      event.key === 'Escape' &&
      (document.activeElement === elements.searchInput || elements.searchInput.value)
    ) {
      event.preventDefault()
      this.clearSearch()
      return
    }

    if (
      event.key === '/' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isTextInput(event.target)
    ) {
      event.preventDefault()
      elements.searchInput.focus()
      elements.searchInput.select()
    }
  }
}

function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  )
}

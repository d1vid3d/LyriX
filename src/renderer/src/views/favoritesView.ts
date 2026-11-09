import type { FavoriteMissing } from '../../../shared/types'
import type { FavoritesStatusModel } from '../../favorites/favoritesStatusModel'
import type { AppElements } from '../dom'

export interface FavoritesViewDeps {
  elements: AppElements
  onWhy(): void
  onPlay(): void
  onShuffle(): void
  onRemoveMissing(): void
}

/** Header/status/missing-section renderer for the Favorites view. */
export class FavoritesView {
  private readonly deps: FavoritesViewDeps
  private expanded = false

  constructor(deps: FavoritesViewDeps) {
    this.deps = deps
    deps.elements.favoritesWhyButton.addEventListener('click', () => deps.onWhy())
    deps.elements.favoritesPlayButton.addEventListener('click', () => deps.onPlay())
    deps.elements.favoritesShuffleButton.addEventListener('click', () => deps.onShuffle())
    deps.elements.favoritesRemoveMissingButton.addEventListener('click', () =>
      deps.onRemoveMissing()
    )
    deps.elements.favoritesMissingToggle.addEventListener('click', () => {
      this.expanded = !this.expanded
      this.renderMissingBody()
    })
  }

  render(
    status: FavoritesStatusModel,
    missing: readonly FavoriteMissing[],
    hasItems: boolean
  ): void {
    const { elements } = this.deps
    elements.favoritesStatus.textContent = status.text
    elements.favoritesStatus.className = `favorites-status favorites-status--${status.tone}`
    elements.favoritesWhyButton.hidden = !status.showWhy
    elements.favoritesPlayButton.disabled = !hasItems
    elements.favoritesShuffleButton.disabled = !hasItems

    elements.favoritesMissing.hidden = missing.length === 0
    if (missing.length === 0 && this.expanded) this.expanded = false
    this.renderMissing(missing)
  }

  destroy(): void {
    // Buttons live for the page lifetime; listeners are owned by the composition root.
  }

  private renderMissing(missing: readonly FavoriteMissing[]): void {
    const { elements } = this.deps
    const count = missing.length
    elements.favoritesMissingToggle.textContent =
      count === 1
        ? "1 favorite couldn't be found in this library"
        : `${count} favorites couldn't be found in this library`
    elements.favoritesMissingToggle.setAttribute('aria-expanded', String(this.expanded))
    elements.favoritesMissingBody.hidden = !this.expanded

    const fragment = document.createDocumentFragment()
    for (const item of missing) {
      const row = document.createElement('li')
      row.className = 'favorites-missing-row'

      const title = document.createElement('span')
      title.className = 'favorites-missing-title'
      title.textContent = item.title

      const meta = document.createElement('span')
      meta.className = 'favorites-missing-meta'
      meta.textContent = [item.artist, item.album].filter(Boolean).join(' · ')

      row.append(title, meta)
      fragment.append(row)
    }
    elements.favoritesMissingList.replaceChildren(fragment)
  }

  private renderMissingBody(): void {
    const { elements } = this.deps
    elements.favoritesMissingToggle.setAttribute('aria-expanded', String(this.expanded))
    elements.favoritesMissingBody.hidden = !this.expanded
  }
}

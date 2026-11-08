import type { Album } from '../../../shared/types'
import type { AlbumItem } from '../../library/query'
import type { MenuPosition } from '../../ui/contextMenu'
import { renderAlbumCards } from './albumCards'

export interface AlbumGridOptions {
  container: HTMLElement
  emptyState: HTMLElement
  emptyMessage(): string
  onOpenAlbum(albumId: string): void
  onOpenAlbumMenu?(album: Album, position: MenuPosition): void
}

export function renderAlbumGrid(
  options: AlbumGridOptions,
  items: readonly AlbumItem[]
): void {
  if (items.length === 0) {
    options.container.replaceChildren()
    options.container.hidden = true
    options.emptyState.hidden = false
    options.emptyState.textContent = options.emptyMessage()
    return
  }

  options.container.hidden = false
  options.emptyState.hidden = true
  renderAlbumCards(
    options.container,
    items.map((item) => item.album),
    options.onOpenAlbum,
    options.onOpenAlbumMenu
  )
}

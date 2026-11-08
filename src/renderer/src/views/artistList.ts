import type { ArtistItem } from '../../library/query'
import type { MenuPosition } from '../../ui/contextMenu'
import { attachMenuTrigger } from '../../ui/menuTrigger'

export interface ArtistListOptions {
  list: HTMLElement
  empty: HTMLElement
  emptyMessage(): string
  onOpenArtist(artistName: string): void
  onOpenArtistMenu?(artist: ArtistItem, position: MenuPosition): void
}

export function renderArtistList(
  options: ArtistListOptions,
  items: readonly ArtistItem[]
): void {
  options.list.replaceChildren()

  if (items.length === 0) {
    options.list.hidden = true
    options.empty.hidden = false
    options.empty.textContent = options.emptyMessage()
    return
  }

  options.list.hidden = false
  options.empty.hidden = true

  const fragment = document.createDocumentFragment()
  for (const artist of items) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'artist-row'

    const name = document.createElement('span')
    name.className = 'artist-name'
    name.textContent = artist.name

    const albumLabel = artist.albumCount === 1 ? '1 album' : `${artist.albumCount} albums`
    const trackLabel = artist.trackCount === 1 ? '1 track' : `${artist.trackCount} tracks`
    const meta = document.createElement('span')
    meta.className = 'artist-meta'
    meta.textContent = `${albumLabel} · ${trackLabel}`

    button.append(name, meta)
    button.addEventListener('click', () => options.onOpenArtist(artist.name))
    if (options.onOpenArtistMenu) {
      const onMenu = options.onOpenArtistMenu
      attachMenuTrigger(button, (position) => onMenu(artist, position))
    }
    item.append(button)
    fragment.append(item)
  }

  options.list.append(fragment)
}

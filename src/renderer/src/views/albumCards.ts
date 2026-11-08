import type { Album } from '../../../shared/types'
import type { MenuPosition } from '../../ui/contextMenu'
import { attachMenuTrigger } from '../../ui/menuTrigger'
import { createCover } from '../format'

export function createAlbumCard(
  album: Album,
  onOpenAlbum: (albumId: string) => void,
  onOpenAlbumMenu?: (album: Album, position: MenuPosition) => void
): HTMLButtonElement {
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'album-card'
  card.append(createCover(album.coverUrl, `${album.title} cover`))

  const title = document.createElement('span')
  title.className = 'album-title'
  title.textContent = album.title

  const artist = document.createElement('span')
  artist.className = 'album-artist'
  artist.textContent = album.artist

  card.append(title, artist)
  card.addEventListener('click', () => onOpenAlbum(album.id))
  if (onOpenAlbumMenu) {
    attachMenuTrigger(card, (position) => onOpenAlbumMenu(album, position))
  }
  return card
}

export function renderAlbumCards(
  container: HTMLElement,
  albums: readonly Album[],
  onOpenAlbum: (albumId: string) => void,
  onOpenAlbumMenu?: (album: Album, position: MenuPosition) => void
): void {
  const fragment = document.createDocumentFragment()
  for (const album of albums) {
    fragment.append(createAlbumCard(album, onOpenAlbum, onOpenAlbumMenu))
  }
  container.replaceChildren(fragment)
}

import type { ArtistItem } from '../../library/query'
import { renderAlbumCards } from './albumCards'

export interface ArtistDetailOptions {
  backButton: HTMLElement
  name: HTMLElement
  meta: HTMLElement
  albumGrid: HTMLElement
  onOpenAlbum(albumId: string): void
}

export function renderArtistDetail(
  options: ArtistDetailOptions,
  artist: ArtistItem
): void {
  options.backButton.textContent = '← Artists'
  options.name.textContent = artist.name

  const albumLabel = artist.albumCount === 1 ? '1 album' : `${artist.albumCount} albums`
  const trackLabel = artist.trackCount === 1 ? '1 track' : `${artist.trackCount} tracks`
  options.meta.textContent = `${albumLabel} · ${trackLabel}`

  renderAlbumCards(options.albumGrid, artist.albums, options.onOpenAlbum)
}

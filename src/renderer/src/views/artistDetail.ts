import type { ArtistItem } from '../../library/query'
import { renderAlbumCards } from './albumCards'

export interface ArtistDetailOptions {
  backButton: HTMLElement
  name: HTMLElement
  meta: HTMLElement
  playButton: HTMLButtonElement
  shuffleButton: HTMLButtonElement
  albumGrid: HTMLElement
  onOpenAlbum(albumId: string): void
  onPlayArtist(artist: ArtistItem): void
  onShuffleArtist(artist: ArtistItem): void
}

export function renderArtistDetail(
  options: ArtistDetailOptions,
  artist: ArtistItem
): void {
  options.backButton.textContent = '← Artists'
  options.name.textContent = artist.name
  options.playButton.onclick = () => options.onPlayArtist(artist)
  options.shuffleButton.onclick = () => options.onShuffleArtist(artist)

  const albumLabel = artist.albumCount === 1 ? '1 album' : `${artist.albumCount} albums`
  const trackLabel = artist.trackCount === 1 ? '1 track' : `${artist.trackCount} tracks`
  options.meta.textContent = `${albumLabel} · ${trackLabel}`

  renderAlbumCards(options.albumGrid, artist.albums, options.onOpenAlbum)
}

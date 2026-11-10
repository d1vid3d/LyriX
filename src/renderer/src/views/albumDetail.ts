import type { Album, Track } from '../../../shared/types'
import type { MenuPosition } from '../../ui/contextMenu'
import { createFavoriteButton } from '../../ui/favoriteButton'
import { attachMenuTrigger } from '../../ui/menuTrigger'
import { formatTime, setCoverImage } from '../format'

export interface AlbumDetailOptions {
  backButton: HTMLElement
  coverImage: HTMLImageElement
  title: HTMLElement
  artist: HTMLElement
  year: HTMLElement
  playButton: HTMLButtonElement
  shuffleButton: HTMLButtonElement
  trackList: HTMLElement
  backLabel(): string
  getCurrentTrackId(): string | null
  isFavorite?(trackId: string): boolean
  onToggleFavorite?(trackId: string): void
  onPlayTrack(album: Album, track: Track): void
  onOpenTrackMenu?(album: Album, track: Track, play: () => void, position: MenuPosition): void
  onPlayAlbum(album: Album): void
  onShuffleAlbum(album: Album): void
}

export function renderAlbumDetail(options: AlbumDetailOptions, album: Album): void {
  options.backButton.textContent = options.backLabel()
  options.title.textContent = album.title
  options.artist.textContent = album.artist
  options.playButton.onclick = () => options.onPlayAlbum(album)
  options.shuffleButton.onclick = () => options.onShuffleAlbum(album)

  if (album.year === null) {
    options.year.hidden = true
    options.year.textContent = ''
  } else {
    options.year.hidden = false
    options.year.textContent = String(album.year)
  }

  setCoverImage(options.coverImage, album.coverUrl, `${album.title} cover`)
  renderTrackList(options, album)
}

function renderTrackList(options: AlbumDetailOptions, album: Album): void {
  options.trackList.replaceChildren()
  const fragment = document.createDocumentFragment()
  const currentId = options.getCurrentTrackId()

  for (const track of album.tracks) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'track'
    button.dataset.trackId = track.id

    if (currentId === track.id) {
      button.classList.add('playing')
      button.setAttribute('aria-current', 'true')
    }

    const number = document.createElement('span')
    number.className = 'track-number'
    number.textContent = track.trackNumber === null ? '—' : String(track.trackNumber)

    const title = document.createElement('span')
    title.className = 'track-title'
    title.textContent = track.title

    const duration = document.createElement('span')
    duration.className = 'track-duration'
    duration.textContent = formatTime(track.duration)

    button.append(title, duration)
    button.prepend(number)
    const play = (): void => options.onPlayTrack(album, track)
    button.addEventListener('click', play)
    if (options.onOpenTrackMenu) {
      const onMenu = options.onOpenTrackMenu
      attachMenuTrigger(button, (position) => onMenu(album, track, play, position))
    }

    item.append(button)
    if (options.isFavorite && options.onToggleFavorite) {
      item.append(
        createFavoriteButton(track.id, options.isFavorite(track.id), options.onToggleFavorite)
      )
    }
    fragment.append(item)
  }

  options.trackList.append(fragment)
}

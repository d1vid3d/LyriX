import type { Album, Track } from '../../../shared/types'
import { formatTime, setCoverImage } from '../format'

export interface AlbumDetailOptions {
  backButton: HTMLElement
  coverImage: HTMLImageElement
  title: HTMLElement
  artist: HTMLElement
  year: HTMLElement
  trackList: HTMLElement
  backLabel(): string
  getCurrentTrackId(): string | null
  onPlayTrack(album: Album, track: Track): void
}

export function renderAlbumDetail(options: AlbumDetailOptions, album: Album): void {
  options.backButton.textContent = options.backLabel()
  options.title.textContent = album.title
  options.artist.textContent = album.artist

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
    button.addEventListener('click', () => options.onPlayTrack(album, track))

    item.append(button)
    fragment.append(item)
  }

  options.trackList.append(fragment)
}

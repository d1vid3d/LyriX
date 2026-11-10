import type { Track } from '../../../shared/types'
import type { TrackItem } from '../../library/query'
import type { MenuPosition } from '../../ui/contextMenu'
import { createFavoriteButton } from '../../ui/favoriteButton'
import { attachMenuTrigger } from '../../ui/menuTrigger'
import { VirtualList } from '../../ui/virtualList'
import { createCover, formatTime, smallCoverUrl } from '../format'

export interface TracksListOptions {
  scroll: HTMLElement
  empty: HTMLElement
  rowHeight: number
  emptyMessage(): string
  getCurrentTrackId(): string | null
  onPlayTrack(index: number): void
  isFavorite?(trackId: string): boolean
  onToggleFavorite?(trackId: string): void
  /** Optional extra line/slot used by Recently played. */
  metaFor?(item: TrackItem): string | null
  onOpenTrackMenu?(item: TrackItem, index: number, play: () => void, position: MenuPosition): void
}

export class TracksList {
  private readonly options: TracksListOptions
  private readonly virtualList: VirtualList<TrackItem>
  private visibleItems: TrackItem[] = []

  constructor(options: TracksListOptions) {
    this.options = options
    this.virtualList = new VirtualList<TrackItem>({
      container: options.scroll,
      rowHeight: options.rowHeight,
      overscan: 4,
      renderRow: (item, index) => this.createRow(item, index)
    })
  }

  render(items: readonly TrackItem[], options: { preserveScroll?: boolean } = {}): void {
    this.visibleItems = [...items]

    if (items.length === 0) {
      this.options.scroll.hidden = true
      this.options.empty.hidden = false
      this.options.empty.textContent = this.options.emptyMessage()
      this.virtualList.setItems([])
      return
    }

    this.options.scroll.hidden = false
    this.options.empty.hidden = true
    this.virtualList.setItems(items, options)
  }

  getVisibleTracks(): Track[] {
    return this.visibleItems.map((item) => item.track)
  }

  refreshHighlight(): void {
    this.virtualList.refresh()
  }

  destroy(): void {
    this.virtualList.destroy()
  }

  private createRow(item: TrackItem, index: number): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'track-row-wrap'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'track-row'

    if (this.options.getCurrentTrackId() === item.track.id) {
      button.classList.add('playing')
      button.setAttribute('aria-current', 'true')
    }

    const thumb = createCover(
      smallCoverUrl(item.album.coverUrl),
      `${item.album.title} cover`,
      'track-thumb'
    )

    const title = document.createElement('span')
    title.className = 'track-row-title'
    title.textContent = item.track.title

    const artist = document.createElement('span')
    artist.className = 'track-row-artist'
    artist.textContent = item.track.artist

    const album = document.createElement('span')
    album.className = 'track-row-album'
    album.textContent = item.album.title

    const duration = document.createElement('span')
    duration.className = 'track-row-duration'
    duration.textContent = formatTime(item.track.duration)

    button.append(thumb, title, artist, album)
    const meta = this.options.metaFor?.(item) ?? null
    if (meta) {
      const metaElement = document.createElement('span')
      metaElement.className = 'track-row-meta'
      metaElement.textContent = meta
      button.append(metaElement)
    }
    button.append(duration)
    const play = (): void => this.options.onPlayTrack(index)
    button.addEventListener('click', play)
    const onMenu = this.options.onOpenTrackMenu
    if (onMenu) {
      attachMenuTrigger(button, (position) => onMenu(item, index, play, position))
    }

    wrapper.append(button)
    if (this.options.isFavorite && this.options.onToggleFavorite) {
      wrapper.append(
        createFavoriteButton(
          item.track.id,
          this.options.isFavorite(item.track.id),
          this.options.onToggleFavorite
        )
      )
    }
    return wrapper
  }
}

import type { Album, Track } from '../../shared/types'
import type { ArtistItem, TrackItem } from '../library/query'
import type { ContextMenuItem } from '../menus/contextMenuModels'
import {
  buildAlbumMenu,
  buildArtistMenu,
  buildCurrentTrackMenu,
  buildQueueRowMenu,
  buildTrackMenu
} from '../menus/contextMenuModels'
import type { QueuePanelEntryRow } from '../queue/queuePanelModel'
import type { ContextMenu, MenuPosition } from '../ui/contextMenu'

export interface ContextMenuOpenersDeps {
  menu: ContextMenu<ContextMenuItem>
  getCurrentTrack(): Track | null
  findAlbumForTrack(track: Track): Album | null
  isFavorite(trackId: string): boolean
}

export interface ContextMenuOpeners {
  openTrackMenu(item: TrackItem, play: () => void, position: MenuPosition): void
  openAlbumTrackMenu(
    album: Album,
    track: Album['tracks'][number],
    play: () => void,
    position: MenuPosition
  ): void
  openAlbumMenu(album: Album, position: MenuPosition): void
  openArtistMenu(artist: ArtistItem, position: MenuPosition): void
  openQueueRowMenu(row: QueuePanelEntryRow, position: MenuPosition): void
  openCurrentTrackMenu(position: MenuPosition): void
}

/** Builds every menu from the composition root's library/queue state. */
export function createContextMenuOpeners(
  deps: ContextMenuOpenersDeps
): ContextMenuOpeners {
  return {
    openTrackMenu(item, play, position) {
      deps.menu.show(
        buildTrackMenu({
          track: item.track,
          album: item.album,
          play,
          isFavorite: deps.isFavorite(item.track.id)
        }),
        position
      )
    },
    openAlbumTrackMenu(album, track, play, position) {
      deps.menu.show(
        buildTrackMenu({
          track,
          album,
          play,
          isFavorite: deps.isFavorite(track.id)
        }),
        position
      )
    },
    openAlbumMenu(album, position) {
      deps.menu.show(buildAlbumMenu({ album }), position)
    },
    openArtistMenu(artist, position) {
      deps.menu.show(buildArtistMenu({ artist }), position)
    },
    openQueueRowMenu(row, position) {
      deps.menu.show(
        buildQueueRowMenu({ ...row, isFavorite: deps.isFavorite(row.track.id) }),
        position
      )
    },
    openCurrentTrackMenu(position) {
      const track = deps.getCurrentTrack()
      if (!track) return

      const album = deps.findAlbumForTrack(track)
      deps.menu.show(
        buildCurrentTrackMenu({
          track,
          albumId: album?.id ?? null,
          artistName: album?.artist ?? track.artist,
          isFavorite: deps.isFavorite(track.id)
        }),
        position
      )
    }
  }
}

import type { Album, Track } from '../../shared/types'
import { getArtistTracks } from '../library/artistTracks'
import type { ArtistItem } from '../library/query'
import type { QueueContext } from '../player/queue'
import type { MenuItem } from '../ui/contextMenu'

export type ContextActionId =
  | 'track.play'
  | 'track.playNext'
  | 'track.addToQueue'
  | 'track.goToAlbum'
  | 'track.goToArtist'
  | 'track.reveal'
  | 'track.toggleFavorite'
  | 'album.play'
  | 'album.shuffle'
  | 'album.playNext'
  | 'album.addToQueue'
  | 'album.goToArtist'
  | 'album.reveal'
  | 'artist.play'
  | 'artist.shuffle'
  | 'artist.playNext'
  | 'artist.addToQueue'
  | 'queueRow.playNow'
  | 'queueRow.playNext'
  | 'queueRow.moveTop'
  | 'queueRow.moveBottom'
  | 'queueRow.remove'
  | 'queueRow.goToAlbum'
  | 'queueRow.goToArtist'
  | 'queueRow.reveal'
  | 'queueRow.toggleFavorite'
  | 'currentTrack.goToAlbum'
  | 'currentTrack.goToArtist'
  | 'currentTrack.reveal'
  | 'currentTrack.toggleFavorite'

/** Everything an action might need. Builders fill every field, using null for inapplicable data. */
export interface ContextActionPayload {
  track: Track | null
  tracks: readonly Track[]
  album: Album | null
  artist: ArtistItem | null
  albumId: string | null
  artistName: string | null
  entryId: string | null
  context: QueueContext | null
  play: (() => void) | null
}

export interface ContextMenuItem extends MenuItem {
  action?: ContextActionId
  payload?: ContextActionPayload
}

export interface TrackMenuTarget {
  track: Track
  album: Album | null
  /** The exact closure used by the row's click, so the menu keeps the row's queue context. */
  play(): void
  isFavorite?: boolean
}

export interface AlbumMenuTarget {
  album: Album
}

export interface ArtistMenuTarget {
  artist: ArtistItem
}

export interface QueueRowMenuTarget {
  entryId: string
  track: Track
  albumId: string | null
  artistName: string | null
  isCurrent: boolean
  isFavorite?: boolean
}

export interface CurrentTrackMenuTarget {
  track: Track
  albumId: string | null
  artistName: string | null
  isFavorite?: boolean
}

export function buildTrackMenu(target: TrackMenuTarget): ContextMenuItem[] {
  const tracks = [target.track]
  const context: QueueContext = target.album
    ? { kind: 'album', label: target.album.title }
    : { kind: 'other', label: 'Tracks' }
  const base = payload({
    track: target.track,
    tracks,
    album: target.album,
    albumId: target.album?.id ?? null,
    artistName: target.album?.artist ?? target.track.artist,
    context,
    play: target.play
  })

  return [
    action('play', 'Play', 'track.play', base),
    action('play-next', 'Play next', 'track.playNext', base),
    action('add-to-queue', 'Add to queue', 'track.addToQueue', base),
    action(
      'toggle-favorite',
      favoriteLabel(target.isFavorite),
      'track.toggleFavorite',
      base
    ),
    separator('track-main'),
    action('go-to-album', 'Go to album', 'track.goToAlbum', base),
    action('go-to-artist', 'Go to artist', 'track.goToArtist', base),
    separator('track-navigation'),
    action('reveal', 'Show in file manager', 'track.reveal', base)
  ]
}

export function buildAlbumMenu(target: AlbumMenuTarget): ContextMenuItem[] {
  const { album } = target
  const tracks = album.tracks
  // Reveal works on a track id, so an album menu reveals its first track's file.
  const firstTrack = tracks[0] ?? null
  const base = payload({
    track: firstTrack,
    tracks,
    album,
    albumId: album.id,
    artistName: album.artist,
    context: { kind: 'album', label: album.title }
  })

  return [
    action('play', 'Play', 'album.play', base),
    action('shuffle', 'Shuffle', 'album.shuffle', base),
    action('play-next', countedLabel('Play next', tracks.length), 'album.playNext', base),
    action('add-to-queue', countedLabel('Add to queue', tracks.length), 'album.addToQueue', base),
    separator('album-main'),
    action('go-to-artist', 'Go to artist', 'album.goToArtist', base),
    action('reveal', 'Show in file manager', 'album.reveal', base, !firstTrack)
  ]
}

export function buildArtistMenu(target: ArtistMenuTarget): ContextMenuItem[] {
  const { artist } = target
  const tracks = getArtistTracks(artist)
  const base = payload({
    tracks,
    artist,
    artistName: artist.name,
    context: { kind: 'artist', label: artist.name }
  })

  return [
    action('play', 'Play', 'artist.play', base),
    action('shuffle', 'Shuffle', 'artist.shuffle', base),
    action('play-next', countedLabel('Play next', tracks.length), 'artist.playNext', base),
    action('add-to-queue', countedLabel('Add to queue', tracks.length), 'artist.addToQueue', base)
  ]
}

export function buildQueueRowMenu(target: QueueRowMenuTarget): ContextMenuItem[] {
  const movingDisabled = target.isCurrent
  const base = payload({
    track: target.track,
    tracks: [target.track],
    albumId: target.albumId,
    artistName: target.artistName,
    entryId: target.entryId
  })

  return [
    action('play-now', 'Play now', 'queueRow.playNow', base),
    action('play-next', 'Play next', 'queueRow.playNext', base, movingDisabled),
    action('move-top', 'Move to top of Next up', 'queueRow.moveTop', base, movingDisabled),
    action('move-bottom', 'Move to bottom', 'queueRow.moveBottom', base, movingDisabled),
    action('remove', 'Remove', 'queueRow.remove', base, movingDisabled),
    action(
      'toggle-favorite',
      favoriteLabel(target.isFavorite),
      'queueRow.toggleFavorite',
      base
    ),
    separator('queue-row-main'),
    action('go-to-album', 'Go to album', 'queueRow.goToAlbum', base),
    action('go-to-artist', 'Go to artist', 'queueRow.goToArtist', base),
    separator('queue-row-navigation'),
    action('reveal', 'Show in file manager', 'queueRow.reveal', base)
  ]
}

export function buildCurrentTrackMenu(target: CurrentTrackMenuTarget): ContextMenuItem[] {
  const base = payload({
    track: target.track,
    tracks: [target.track],
    albumId: target.albumId,
    artistName: target.artistName
  })

  return [
    action(
      'toggle-favorite',
      favoriteLabel(target.isFavorite),
      'currentTrack.toggleFavorite',
      base
    ),
    separator('current-track-favorite'),
    action('go-to-album', 'Go to album', 'currentTrack.goToAlbum', base),
    action('go-to-artist', 'Go to artist', 'currentTrack.goToArtist', base),
    separator('current-track-navigation'),
    action('reveal', 'Show in file manager', 'currentTrack.reveal', base)
  ]
}

function payload(overrides: Partial<ContextActionPayload>): ContextActionPayload {
  return {
    track: null,
    tracks: [],
    album: null,
    artist: null,
    albumId: null,
    artistName: null,
    entryId: null,
    context: null,
    play: null,
    ...overrides
  }
}

function action(
  id: string,
  label: string,
  actionId: ContextActionId,
  itemPayload: ContextActionPayload,
  disabled = false
): ContextMenuItem {
  return { id, label, action: actionId, payload: itemPayload, disabled }
}

function separator(id: string): ContextMenuItem {
  return { id: `separator-${id}`, label: '', separator: true }
}

function countedLabel(label: string, count: number): string {
  return count > 1 ? `${label} (${count} tracks)` : label
}

function favoriteLabel(isFavorite: boolean | undefined): string {
  return isFavorite ? 'Remove from Favorites' : 'Add to Favorites'
}

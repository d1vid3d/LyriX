import { describe, expect, it, vi } from 'vitest'
import type { Album, Track } from '../src/shared/types'
import type { ArtistItem } from '../src/renderer/library/query'
import {
  buildAlbumMenu,
  buildArtistMenu,
  buildCurrentTrackMenu,
  buildQueueRowMenu,
  buildTrackMenu
} from '../src/renderer/menus/contextMenuModels'

function track(id: string, title = `Title ${id}`): Track {
  return {
    id,
    title,
    artist: `Artist ${id}`,
    album: 'Album',
    albumArtist: 'Album Artist',
    trackNumber: null,
    discNumber: null,
    year: null,
    duration: 10,
    url: `media://track/${id}`
  }
}

function album(values: Track[]): Album {
  return {
    id: 'album-1',
    title: 'Test Album',
    artist: 'Album Artist',
    year: null,
    coverUrl: 'media://cover/album-1',
    tracks: values
  }
}

function artist(values: Track[]): ArtistItem {
  const value = album(values)
  return {
    kind: 'artist',
    name: 'Album Artist',
    albums: [value],
    albumCount: 1,
    trackCount: values.length,
    searchText: 'album artist'
  }
}

function labels(items: ReturnType<typeof buildTrackMenu>): string[] {
  return items.filter((item) => !item.separator).map((item) => item.label)
}

describe('track menu', () => {
  it('offers playback, navigation, and reveal with the row play closure', () => {
    const value = track('a')
    const play = vi.fn()
    const items = buildTrackMenu({ track: value, album: album([value]), play })

    expect(labels(items)).toEqual([
      'Play',
      'Play next',
      'Add to queue',
      'Add to Favorites',
      'Go to album',
      'Go to artist',
      'Show in file manager'
    ])
    expect(items.filter((item) => item.separator)).toHaveLength(2)

    const playItem = items[0]
    expect(playItem.action).toBe('track.play')
    expect(playItem.payload?.play).toBe(play)
    expect(playItem.payload?.tracks).toEqual([value])
    expect(playItem.payload?.albumId).toBe('album-1')
    expect(playItem.payload?.artistName).toBe('Album Artist')
    expect(playItem.payload?.context).toEqual({ kind: 'album', label: 'Test Album' })
  })

  it('falls back to an other context for a track without an album', () => {
    const value = track('a')
    const items = buildTrackMenu({ track: value, album: null, play: () => undefined })

    expect(items[0].payload?.context).toEqual({ kind: 'other', label: 'Tracks' })
    expect(items[0].payload?.artistName).toBe('Artist a')
    expect(items[0].payload?.albumId).toBeNull()
  })
})

describe('album and artist menus', () => {
  it('pluralizes queue labels from the track count', () => {
    const values = [track('a'), track('b')]
    const albumItems = buildAlbumMenu({ album: album(values) })

    expect(labels(albumItems)).toEqual([
      'Play',
      'Shuffle',
      'Play next (2 tracks)',
      'Add to queue (2 tracks)',
      'Go to artist',
      'Show in file manager'
    ])

    const artistItems = buildArtistMenu({ artist: artist(values) })
    expect(labels(artistItems)).toEqual([
      'Play',
      'Shuffle',
      'Play next (2 tracks)',
      'Add to queue (2 tracks)'
    ])
    expect(artistItems[0].action).toBe('artist.play')
    expect(artistItems[0].payload?.context).toEqual({
      kind: 'artist',
      label: 'Album Artist'
    })
  })

  it('omits the count for a single track', () => {
    const item = buildAlbumMenu({ album: album([track('a')]) })
    expect(labels(item)).toContain('Play next')
    expect(labels(item)).toContain('Add to queue')
  })

  it('carries the first track so album reveal and go-to-artist can run', () => {
    const values = [track('a'), track('b')]
    const items = buildAlbumMenu({ album: album(values) })
    const base = items[0].payload

    expect(base?.track?.id).toBe('a')
    expect(base?.album?.id).toBe('album-1')
    expect(base?.artistName).toBe('Album Artist')

    const goToArtist = items.find((item) => item.action === 'album.goToArtist')
    const reveal = items.find((item) => item.action === 'album.reveal')
    expect(goToArtist?.payload?.artistName).toBe('Album Artist')
    expect(reveal?.payload?.track?.id).toBe('a')
    expect(reveal?.disabled).toBe(false)
  })

  it('disables album reveal when the album has no tracks', () => {
    const item = buildAlbumMenu({ album: album([]) }).find(
      (value) => value.action === 'album.reveal'
    )
    expect(item?.disabled).toBe(true)
    expect(item?.payload?.track).toBeNull()
  })
  it('uses the favorite state for the label', () => {
    const value = track('a')
    const favorite = buildTrackMenu({
      track: value,
      album: album([value]),
      play: () => undefined,
      isFavorite: true
    })
    const notFavorite = buildTrackMenu({
      track: value,
      album: album([value]),
      play: () => undefined,
      isFavorite: false
    })

    expect(favorite.find((item) => item.action === 'track.toggleFavorite')?.label).toBe(
      'Remove from Favorites'
    )
    expect(notFavorite.find((item) => item.action === 'track.toggleFavorite')?.label).toBe(
      'Add to Favorites'
    )
  })
})

describe('queue row menu', () => {
  it('disables destructive and moving actions for the current entry', () => {
    const items = buildQueueRowMenu({
      entryId: 'entry-1',
      track: track('a'),
      albumId: 'album-1',
      artistName: 'Album Artist',
      isCurrent: true
    })

    for (const id of [
      'queueRow.playNext',
      'queueRow.moveTop',
      'queueRow.moveBottom',
      'queueRow.remove'
    ]) {
      const item = items.find((value) => value.action === id)
      expect(item?.disabled).toBe(true)
    }

    expect(items.find((value) => value.action === 'queueRow.playNow')?.disabled).toBe(false)
    expect(labels(items)).toEqual([
      'Play now',
      'Play next',
      'Move to top of Next up',
      'Move to bottom',
      'Remove',
      'Add to Favorites',
      'Go to album',
      'Go to artist',
      'Show in file manager'
    ])
  })

  it('enables all actions for another upcoming row', () => {
    const items = buildQueueRowMenu({
      entryId: 'entry-1',
      track: track('a'),
      albumId: null,
      artistName: null,
      isCurrent: false
    })

    expect(items.every((item) => item.separator || !item.disabled)).toBe(true)
    expect(items[0].payload?.entryId).toBe('entry-1')
    expect(items[0].payload?.track?.id).toBe('a')
  })
})

describe('current track menu', () => {
  it('contains only navigation and reveal actions', () => {
    const items = buildCurrentTrackMenu({
      track: track('a'),
      albumId: 'album-1',
      artistName: 'Album Artist'
    })

    expect(labels(items)).toEqual([
      'Add to Favorites',
      'Go to album',
      'Go to artist',
      'Show in file manager'
    ])
    expect(items[0].action).toBe('currentTrack.toggleFavorite')
    expect(items[2].action).toBe('currentTrack.goToAlbum')
    expect(items.find((item) => item.action === 'currentTrack.reveal')?.action).toBe(
      'currentTrack.reveal'
    )
  })
})

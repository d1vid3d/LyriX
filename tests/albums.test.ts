import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { groupTracks } from '../src/main/albums'
import type { Album, Track } from '../src/shared/types'

function track(partial: Partial<Track> & Pick<Track, 'id' | 'title'>): Track {
  return {
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNumber: null,
    discNumber: null,
    year: null,
    duration: 0,
    url: `media://track/${partial.id}`,
    ...partial
  }
}

function byArtist(albums: Album[], artist: string): Album {
  const album = albums.find((item) => item.artist === artist)
  if (!album) throw new Error(`No album for artist ${artist}`)
  return album
}

describe('groupTracks', () => {
  it('groups by album artist plus album title', () => {
    const albums = groupTracks([
      track({ id: 'a1', title: 'A1', artist: 'Singer A', albumArtist: 'A', album: 'Shared' }),
      track({ id: 'b1', title: 'B1', artist: 'Singer B', albumArtist: 'B', album: 'Shared' }),
      track({ id: 'a2', title: 'A2', artist: 'Singer A', albumArtist: 'A', album: 'Shared' })
    ])

    expect(albums).toHaveLength(2)

    const a = byArtist(albums, 'A')
    const b = byArtist(albums, 'B')

    expect(a.title).toBe('Shared')
    expect(a.tracks.map((item) => item.id)).toEqual(['a1', 'a2'])
    expect(b.tracks.map((item) => item.id)).toEqual(['b1'])
    expect(a.id).not.toBe(b.id)
  })

  it('uses albumArtist verbatim and does not fall back to track artist', () => {
    // Current behavior: the artist fallback happens in tags.ts before tracks reach groupTracks.
    const [byAlbumArtist] = groupTracks([
      track({
        id: 'v1',
        title: 'Various',
        artist: 'Solo',
        albumArtist: 'Various Artists',
        album: 'Compilation'
      })
    ])
    expect(byAlbumArtist.artist).toBe('Various Artists')

    const [emptyAlbumArtist] = groupTracks([
      track({
        id: 'e1',
        title: 'Empty',
        artist: 'Solo',
        albumArtist: '',
        album: 'No Album Artist'
      })
    ])
    expect(emptyAlbumArtist.artist).toBe('')
  })

  it('orders tracks by disc, track number, then title', () => {
    const albums = groupTracks([
      track({
        id: 'c',
        title: 'C',
        album: 'Record',
        albumArtist: 'A',
        discNumber: 2,
        trackNumber: 1
      }),
      track({
        id: 'd',
        title: 'D',
        album: 'Record',
        albumArtist: 'A',
        discNumber: 1,
        trackNumber: null
      }),
      track({
        id: 'a',
        title: 'A',
        album: 'Record',
        albumArtist: 'A',
        discNumber: null,
        trackNumber: 2
      }),
      track({
        id: 'b',
        title: 'B',
        album: 'Record',
        albumArtist: 'A',
        discNumber: 1,
        trackNumber: 1
      }),
      track({
        id: 'e',
        title: 'E',
        album: 'Record',
        albumArtist: 'A',
        discNumber: 1,
        trackNumber: 3
      })
    ])

    expect(albums[0].tracks.map((item) => item.title)).toEqual(['B', 'A', 'E', 'D', 'C'])
  })

  it('breaks disc/track ties by title', () => {
    const albums = groupTracks([
      track({
        id: 'z',
        title: 'Zeta',
        album: 'Record',
        albumArtist: 'A',
        discNumber: 1,
        trackNumber: 1
      }),
      track({
        id: 'a',
        title: 'Alpha',
        album: 'Record',
        albumArtist: 'A',
        discNumber: 1,
        trackNumber: 1
      })
    ])

    expect(albums[0].tracks.map((item) => item.title)).toEqual(['Alpha', 'Zeta'])
  })

  it('sorts albums by title, case-insensitively and numerically', () => {
    const albums = groupTracks([
      track({ id: 'z', title: 'Z', album: 'Zebra', albumArtist: 'Z' }),
      track({ id: 'a', title: 'A', album: 'alpha', albumArtist: 'A' }),
      track({ id: 'a10', title: 'A10', album: 'Alpha 10', albumArtist: 'A' }),
      track({ id: 'a2', title: 'A2', album: 'Alpha 2', albumArtist: 'A' })
    ])

    expect(albums.map((item) => item.title)).toEqual(['alpha', 'Alpha 2', 'Alpha 10', 'Zebra'])
  })

  it('uses the first non-null year in track order', () => {
    const albums = groupTracks([
      track({
        id: '1',
        title: 'One',
        album: 'Record',
        albumArtist: 'A',
        trackNumber: 1,
        year: null
      }),
      track({
        id: '2',
        title: 'Two',
        album: 'Record',
        albumArtist: 'A',
        trackNumber: 2,
        year: 1999
      }),
      track({
        id: '3',
        title: 'Three',
        album: 'Record',
        albumArtist: 'A',
        trackNumber: 3,
        year: 2000
      })
    ])

    expect(albums[0].year).toBe(1999)
  })

  it('returns a null year when every track has none', () => {
    const albums = groupTracks([
      track({ id: '1', title: 'One', album: 'Record', albumArtist: 'A', year: null })
    ])

    expect(albums[0].year).toBeNull()
  })

  it('builds deterministic 40-character hex ids from the group key', () => {
    const input = [track({ id: '1', title: 'One', album: 'Shared', albumArtist: 'A' })]

    const first = groupTracks(input)[0]
    const second = groupTracks(input)[0]

    expect(first.id).toBe(second.id)
    expect(first.id).toBe(createHash('sha1').update('A\u0000Shared').digest('hex'))
    expect(first.id).toMatch(/^[a-f0-9]{40}$/)
    expect(first.coverUrl).toBe(`media://cover/${first.id}`)
  })

  it('returns an empty list for no tracks', () => {
    expect(groupTracks([])).toEqual([])
  })

  it('does not reorder the input array', () => {
    const input = [
      track({ id: 'b', title: 'B', album: 'Record', albumArtist: 'A', trackNumber: 2 }),
      track({ id: 'a', title: 'A', album: 'Record', albumArtist: 'A', trackNumber: 1 })
    ]

    groupTracks(input)

    expect(input.map((item) => item.id)).toEqual(['b', 'a'])
  })
})

import { describe, expect, it } from 'vitest'
import { getArtistTracks } from '../src/renderer/library/artistTracks'
import type { ArtistItem } from '../src/renderer/library/query'
import type { Album, Track } from '../src/shared/types'

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: `Title ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNumber: null,
    discNumber: null,
    year: null,
    duration: 0,
    url: `media://track/${id}`,
    ...overrides
  }
}

function album(id: string, overrides: Partial<Album> = {}): Album {
  return {
    id,
    title: `Album ${id}`,
    artist: 'Artist',
    year: null,
    coverUrl: `media://cover/${id}`,
    tracks: [],
    ...overrides
  }
}

function artist(albums: Album[]): ArtistItem {
  return {
    kind: 'artist',
    name: 'Artist',
    albums,
    albumCount: albums.length,
    trackCount: albums.reduce((total, item) => total + item.tracks.length, 0),
    searchText: 'artist'
  }
}

describe('getArtistTracks', () => {
  it('orders albums by year with unknown years last', () => {
    const later = album('later', { year: 2005, tracks: [track('l1')] })
    const unknown = album('unknown', { year: null, tracks: [track('u1')] })
    const earlier = album('earlier', { year: 1999, tracks: [track('e1')] })

    expect(getArtistTracks(artist([later, unknown, earlier])).map((item) => item.id)).toEqual([
      'e1',
      'l1',
      'u1'
    ])
  })

  it('orders equal-year albums by title', () => {
    const zeta = album('zeta', { title: 'Zeta', year: 2000, tracks: [track('z1')] })
    const alpha = album('alpha', { title: 'Alpha', year: 2000, tracks: [track('a1')] })

    expect(getArtistTracks(artist([zeta, alpha])).map((item) => item.id)).toEqual(['a1', 'z1'])
  })

  it('orders tracks by disc, track number, then title', () => {
    const record = album('record', {
      year: 2000,
      tracks: [
        track('d2t1', { discNumber: 2, trackNumber: 1 }),
        track('d1t2', { discNumber: 1, trackNumber: 2 }),
        track('d1t1', { discNumber: 1, trackNumber: 1 }),
        track('d1untitled', { discNumber: 1, trackNumber: null, title: 'Aardvark' })
      ]
    })

    expect(getArtistTracks(artist([record])).map((item) => item.id)).toEqual([
      'd1t1',
      'd1t2',
      'd1untitled',
      'd2t1'
    ])
  })

  it('treats a missing disc number as disc one', () => {
    const record = album('record', {
      tracks: [
        track('disc2', { discNumber: 2, trackNumber: 1 }),
        track('disc1', { discNumber: 1, trackNumber: 1 })
      ]
    })

    expect(getArtistTracks(artist([record])).map((item) => item.id)).toEqual(['disc1', 'disc2'])
  })

  it('does not reorder the input albums or tracks', () => {
    const first = album('first', {
      year: 2001,
      tracks: [track('b', { trackNumber: 2 }), track('a', { trackNumber: 1 })]
    })
    const second = album('second', { year: 1999, tracks: [track('c')] })
    const item = artist([first, second])

    getArtistTracks(item)

    expect(item.albums.map((entry) => entry.id)).toEqual(['first', 'second'])
    expect(item.albums[0].tracks.map((entry) => entry.id)).toEqual(['b', 'a'])
  })
})

import { describe, expect, it } from 'vitest'
import type { Album, Track } from '../src/shared/types'
import {
  buildLibraryIndex,
  getDefaultSort,
  getSortOptions,
  queryLibrary
} from '../src/renderer/library/query'

function track(id: string, title: string, artist = 'Artist'): Track {
  return {
    id,
    title,
    artist,
    album: 'Album',
    albumArtist: artist,
    trackNumber: 1,
    discNumber: null,
    year: null,
    duration: 10,
    url: `media://track/${id}`
  }
}

const tracks = [
  track('a'.repeat(40), 'Beta', 'Zed'),
  track('b'.repeat(40), 'Alpha', 'Amy'),
  track('c'.repeat(40), 'Gamma', 'Amy')
]
const album: Album = {
  id: 'album-1',
  title: 'Album',
  artist: 'Artist',
  year: null,
  coverUrl: 'media://cover/album-1',
  tracks
}

const history = {
  items: [
    { trackId: tracks[0].id, lastPlayedAt: 300, playCount: 2 },
    { trackId: tracks[1].id, lastPlayedAt: 200, playCount: 5 },
    { trackId: tracks[2].id, lastPlayedAt: 100, playCount: 1 }
  ]
}

function titles(sort: string, search = ''): string[] {
  const index = buildLibraryIndex([album], undefined, history)
  return queryLibrary(index, { view: 'recent', sort, search }).map((item) => item.track.title)
}

describe('recent view registry', () => {
  it('uses Last played by default with the expected sorts', () => {
    expect(getDefaultSort('recent')).toBe('last')
    expect(getSortOptions('recent')).toEqual([
      { key: 'last', label: 'Last played' },
      { key: 'plays', label: 'Most played' },
      { key: 'title', label: 'Title' },
      { key: 'artist', label: 'Artist' },
      { key: 'album', label: 'Album' }
    ])
  })

  it('orders by last played and most played', () => {
    expect(titles('last')).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(titles('plays')).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('supports title/artist sorting and search', () => {
    expect(titles('title')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(titles('artist')).toEqual(['Alpha', 'Gamma', 'Beta'])
    expect(titles('last', 'amy')).toEqual(['Alpha', 'Gamma'])
  })

  it('omits tracks that are no longer in the library', () => {
    const index = buildLibraryIndex([album], undefined, {
      items: [...history.items, { trackId: 'missing', lastPlayedAt: 999, playCount: 9 }]
    })
    const items = queryLibrary(index, { view: 'recent', sort: 'last', search: '' })
    expect(items.map((item) => item.track.title)).toEqual(['Beta', 'Alpha', 'Gamma'])
  })
})

import { describe, expect, it } from 'vitest'
import type { Album, Track } from '../src/shared/types'
import {
  buildLibraryIndex,
  getDefaultSort,
  getSortOptions,
  isLibraryView,
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

const favorites = {
  ids: new Set([tracks[0].id, tracks[1].id, tracks[2].id]),
  addedAt: new Map([
    [tracks[0].id, 10],
    [tracks[1].id, 30],
    [tracks[2].id, 20]
  ])
}

function titles(view: 'favorites', sort: string, search = ''): string[] {
  const index = buildLibraryIndex([album], favorites)
  return queryLibrary(index, { view, sort, search }).map((item) => item.track.title)
}

describe('favorites view registry', () => {
  it('accepts the favorites view and default Recently added sort', () => {
    expect(isLibraryView('favorites')).toBe(true)
    expect(getDefaultSort('favorites')).toBe('recent')
    expect(getSortOptions('favorites')).toEqual([
      { key: 'recent', label: 'Recently added' },
      { key: 'title', label: 'Title' },
      { key: 'artist', label: 'Artist' },
      { key: 'album', label: 'Album' }
    ])
  })

  it('lists only favorite tracks ordered by addedAt by default', () => {
    const subset = {
      ids: new Set([tracks[0].id, tracks[2].id]),
      addedAt: new Map([
        [tracks[0].id, 10],
        [tracks[2].id, 40]
      ])
    }
    const index = buildLibraryIndex([album], subset)
    const items = queryLibrary(index, { view: 'favorites', sort: 'recent', search: '' })
    expect(items.map((item) => item.track.title)).toEqual(['Gamma', 'Beta'])
  })

  it('supports title/artist sorting and search', () => {
    expect(titles('favorites', 'title')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(titles('favorites', 'artist')).toEqual(['Alpha', 'Gamma', 'Beta'])
    expect(titles('favorites', 'recent', 'amy')).toEqual(['Alpha', 'Gamma'])
  })

  it('returns an empty list without favorites input', () => {
    const index = buildLibraryIndex([album])
    expect(queryLibrary(index, { view: 'favorites', sort: 'recent', search: '' })).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildLibraryIndex,
  filterBySearch,
  getDefaultSort,
  getSortOptions,
  getViewIds,
  isLibraryView,
  isSortKey,
  normalizeText,
  queryLibrary
} from '../src/renderer/library/query'
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

function album(partial: Partial<Album> & Pick<Album, 'id' | 'title'>): Album {
  return {
    artist: 'Artist',
    year: null,
    coverUrl: `media://cover/${partial.id}`,
    tracks: [],
    ...partial
  }
}

const zebra = album({
  id: 'album-zebra',
  title: 'Zebra',
  artist: 'Aardvark',
  year: 2001,
  tracks: [
    track({
      id: 'track-one',
      title: 'One',
      artist: 'Beta',
      album: 'Zebra',
      albumArtist: 'Aardvark'
    }),
    track({
      id: 'track-two',
      title: 'Two',
      artist: 'Beta',
      album: 'Zebra',
      albumArtist: 'Aardvark'
    })
  ]
})

const alpha = album({
  id: 'album-alpha',
  title: 'alpha',
  artist: 'Alpha',
  year: null,
  tracks: [
    track({
      id: 'track-three',
      title: 'Three',
      artist: 'Alpha',
      album: 'alpha',
      albumArtist: 'Alpha'
    })
  ]
})

const alpha10 = album({
  id: 'album-alpha-10',
  title: 'Alpha 10',
  artist: 'Alpha',
  year: 1999,
  tracks: [
    track({
      id: 'track-four',
      title: 'Four',
      artist: 'Gamma',
      album: 'Alpha 10',
      albumArtist: 'Alpha'
    })
  ]
})

const alpha2 = album({
  id: 'album-alpha-2',
  title: 'Alpha 2',
  artist: 'Alpha',
  year: 1999,
  tracks: [
    track({
      id: 'track-five',
      title: 'Five',
      artist: 'Delta',
      album: 'Alpha 2',
      albumArtist: 'Alpha'
    })
  ]
})

const index = buildLibraryIndex([zebra, alpha, alpha10, alpha2])

function albumTitles(sort: string): string[] {
  return queryLibrary(index, { view: 'albums', search: '', sort }).map((item) => item.album.title)
}

function artistNames(sort: string): string[] {
  return queryLibrary(index, { view: 'artists', search: '', sort }).map((item) => item.name)
}

function trackTitles(sort: string): string[] {
  return queryLibrary(index, { view: 'tracks', search: '', sort }).map((item) => item.track.title)
}

describe('normalizeText', () => {
  it.each([
    ['  Hello   World  ', 'hello world'],
    ['Beyoncé', 'beyonce'],
    ['Sigur Rós', 'sigur ros'],
    ['ÀÉÎÕÜ', 'aeiou'],
    ['A\tB\nC', 'a b c'],
    ['', '']
  ])('normalizes %j to %j', (value, expected) => {
    expect(normalizeText(value)).toBe(expected)
  })
})

describe('filterBySearch', () => {
  const items = [
    { name: 'hello', searchText: 'hello world' },
    { name: 'moon', searchText: 'goodbye moon' },
    { name: 'accent', searchText: 'beyonce' }
  ]

  it('requires every query word, independent of order', () => {
    expect(filterBySearch(items, 'world hello').map((item) => item.name)).toEqual(['hello'])
    expect(filterBySearch(items, 'moon goodbye').map((item) => item.name)).toEqual(['moon'])
    expect(filterBySearch(items, 'hello moon')).toEqual([])
  })

  it('returns every item for an empty or whitespace-only search', () => {
    const empty = filterBySearch(items, '')
    const whitespace = filterBySearch(items, '   ')

    expect(empty.map((item) => item.name)).toEqual(['hello', 'moon', 'accent'])
    expect(whitespace.map((item) => item.name)).toEqual(['hello', 'moon', 'accent'])
    expect(empty).not.toBe(items)
  })

  it('normalizes the query (case and diacritics)', () => {
    expect(filterBySearch(items, 'BEYONCÉ').map((item) => item.name)).toEqual(['accent'])
  })

  it('matches substrings, not only whole words', () => {
    expect(filterBySearch(items, 'wor').map((item) => item.name)).toEqual(['hello'])
  })
})

describe('queryLibrary', () => {
  it.each([
    ['title', ['alpha', 'Alpha 2', 'Alpha 10', 'Zebra']],
    ['artist', ['Zebra', 'alpha', 'Alpha 2', 'Alpha 10']],
    ['year', ['Alpha 2', 'Alpha 10', 'Zebra', 'alpha']]
  ])('sorts albums by %s', (sort, expected) => {
    expect(albumTitles(sort)).toEqual(expected)
  })

  it.each([
    ['name', ['Aardvark', 'Alpha']],
    ['tracks', ['Alpha', 'Aardvark']]
  ])('sorts artists by %s', (sort, expected) => {
    expect(artistNames(sort)).toEqual(expected)
  })

  it.each([
    ['title', ['Five', 'Four', 'One', 'Three', 'Two']],
    ['artist', ['Three', 'One', 'Two', 'Five', 'Four']],
    ['album', ['Three', 'Five', 'Four', 'One', 'Two']]
  ])('sorts tracks by %s', (sort, expected) => {
    expect(trackTitles(sort)).toEqual(expected)
  })

  it('falls back to the default sort for an unknown key', () => {
    expect(albumTitles('not-a-sort')).toEqual(albumTitles('title'))
  })

  it('matches album search text against track titles', () => {
    const results = queryLibrary(index, { view: 'albums', search: 'two', sort: 'title' })

    expect(results.map((item) => item.album.title)).toEqual(['Zebra'])
  })

  it('matches track search text against artist names', () => {
    const results = queryLibrary(index, { view: 'tracks', search: 'gamma', sort: 'title' })

    expect(results.map((item) => item.track.id)).toEqual(['track-four'])
  })

  it('matches artist search text against album titles', () => {
    const results = queryLibrary(index, { view: 'artists', search: 'alpha 10', sort: 'name' })

    expect(results.map((item) => item.name)).toEqual(['Alpha'])
  })
})

describe('artist grouping', () => {
  const exactIndex = buildLibraryIndex([
    album({
      id: 'a1',
      title: 'First',
      artist: 'A',
      tracks: [track({ id: 'a1-t1', title: 'One', album: 'First', albumArtist: 'A' })]
    }),
    album({
      id: 'a2',
      title: 'Second',
      artist: 'A',
      tracks: [track({ id: 'a2-t1', title: 'Two', album: 'Second', albumArtist: 'A' })]
    }),
    album({
      id: 'a3',
      title: 'Together',
      artist: 'A, B',
      tracks: [track({ id: 'a3-t1', title: 'Three', album: 'Together', albumArtist: 'A, B' })]
    }),
    album({
      id: 'a4',
      title: 'Other',
      artist: 'B',
      tracks: [track({ id: 'a4-t1', title: 'Four', album: 'Other', albumArtist: 'B' })]
    })
  ])

  const artists = exactIndex.items.artists

  it('groups by the exact album-artist string', () => {
    expect(artists.map((item) => item.name)).toEqual(['A', 'A, B', 'B'])
    expect(artists[0].albums.map((item) => item.title)).toEqual(['First', 'Second'])
  })

  it('keeps "A, B" separate from "A"', () => {
    expect(artists[0].albumCount).toBe(2)
    expect(artists[0].trackCount).toBe(2)
    expect(artists[1]).toMatchObject({ name: 'A, B', albumCount: 1, trackCount: 1 })
    expect(artists[2]).toMatchObject({ name: 'B', albumCount: 1, trackCount: 1 })
  })
})

describe('view and sort helpers', () => {
  it('lists the view ids', () => {
    expect(getViewIds()).toEqual(['albums', 'artists', 'tracks', 'favorites'])
  })

  it.each([
    ['albums', 'title'],
    ['artists', 'name'],
    ['tracks', 'title']
  ] as const)('returns the default sort for %s', (view, expected) => {
    expect(getDefaultSort(view)).toBe(expected)
  })

  it.each([
    {
      view: 'albums',
      options: [
        { key: 'title', label: 'Title' },
        { key: 'artist', label: 'Artist' },
        { key: 'year', label: 'Year' }
      ]
    },
    {
      view: 'artists',
      options: [
        { key: 'name', label: 'Name' },
        { key: 'tracks', label: 'Track count' }
      ]
    },
    {
      view: 'tracks',
      options: [
        { key: 'title', label: 'Title' },
        { key: 'artist', label: 'Artist' },
        { key: 'album', label: 'Album' }
      ]
    }
  ] as const)('lists the sort options for $view', ({ view, options }) => {
    expect(getSortOptions(view)).toEqual(options)
  })

  it.each(['albums', 'artists', 'tracks'] as const)('accepts the %s view', (view) => {
    expect(isLibraryView(view)).toBe(true)
  })

  it.each([null, undefined, '', 'genres', 1, {}, []])('rejects the view %j', (value) => {
    expect(isLibraryView(value)).toBe(false)
  })

  it.each([
    ['albums', 'title', true],
    ['albums', 'year', true],
    ['albums', 'name', false],
    ['artists', 'tracks', true],
    ['artists', 'title', false],
    ['tracks', 'album', true],
    ['tracks', 'name', false]
  ] as const)('isSortKey(%s, %s) is %s', (view, value, expected) => {
    expect(isSortKey(view, value)).toBe(expected)
  })

  it('rejects non-string and empty sort keys', () => {
    expect(isSortKey('albums', null)).toBe(false)
    expect(isSortKey('albums', '')).toBe(false)
  })
})

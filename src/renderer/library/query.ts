import type { Album } from '../../shared/types'

export type LibraryView = 'albums' | 'artists' | 'tracks'

export interface AlbumItem {
  kind: 'album'
  album: Album
  searchText: string
}

export interface ArtistItem {
  kind: 'artist'
  name: string
  albums: Album[]
  albumCount: number
  trackCount: number
  searchText: string
}

export interface TrackItem {
  kind: 'track'
  track: Album['tracks'][number]
  album: Album
  searchText: string
}

export interface ViewItemMap {
  albums: AlbumItem
  artists: ArtistItem
  tracks: TrackItem
}

export interface SortOption<Item> {
  label: string
  compare(a: Item, b: Item): number
}

interface ViewDefinition<Item> {
  label: string
  defaultSort: string
  sorts: Record<string, SortOption<Item>>
  build(albums: readonly Album[]): Item[]
}

type ViewDefinitions = {
  [V in LibraryView]: ViewDefinition<ViewItemMap[V]>
}

/** Normalizes text for both searchable item text and the query itself. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function queryWords(search: string): string[] {
  const normalized = normalizeText(search)
  return normalized === '' ? [] : normalized.split(' ')
}

function matchesEveryWord(searchText: string, words: readonly string[]): boolean {
  return words.every((word) => searchText.includes(word))
}

/** Search boundary: swap this for a fuzzy matcher without touching the index or UI. */
export function filterBySearch<Item extends { searchText: string }>(
  items: readonly Item[],
  search: string
): Item[] {
  const words = queryWords(search)
  if (words.length === 0) return [...items]
  return items.filter((item) => matchesEveryWord(item.searchText, words))
}

function joinSearchText(parts: readonly string[]): string {
  return normalizeText(parts.join(' '))
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

function compareAlbumTitle(a: AlbumItem, b: AlbumItem): number {
  return compareText(a.album.title, b.album.title) || compareText(a.album.id, b.album.id)
}

function compareAlbumArtist(a: AlbumItem, b: AlbumItem): number {
  return compareText(a.album.artist, b.album.artist) || compareAlbumTitle(a, b)
}

function compareAlbumYear(a: AlbumItem, b: AlbumItem): number {
  if (a.album.year === null && b.album.year === null) return compareAlbumTitle(a, b)
  if (a.album.year === null) return 1
  if (b.album.year === null) return -1
  return a.album.year - b.album.year || compareAlbumTitle(a, b)
}

function compareTrackTitle(a: TrackItem, b: TrackItem): number {
  return (
    compareText(a.track.title, b.track.title) ||
    compareText(a.track.artist, b.track.artist) ||
    compareText(a.album.title, b.album.title) ||
    compareText(a.track.id, b.track.id)
  )
}

function compareTrackArtist(a: TrackItem, b: TrackItem): number {
  return (
    compareText(a.track.artist, b.track.artist) ||
    compareText(a.album.title, b.album.title) ||
    compareTrackTitle(a, b)
  )
}

function compareTrackAlbum(a: TrackItem, b: TrackItem): number {
  return compareText(a.album.title, b.album.title) || compareTrackTitle(a, b)
}

function buildAlbumItems(albums: readonly Album[]): AlbumItem[] {
  return albums.map((album) => ({
    kind: 'album',
    album,
    searchText: joinSearchText([
      album.title,
      album.artist,
      ...album.tracks.map((track) => track.title)
    ])
  }))
}

function buildArtistItems(albums: readonly Album[]): ArtistItem[] {
  const groups = new Map<string, Album[]>()

  // Exact album-artist string: multi-artist values such as "A, B" stay one artist.
  for (const album of albums) {
    const group = groups.get(album.artist)
    if (group) group.push(album)
    else groups.set(album.artist, [album])
  }

  return [...groups].map(([name, artistAlbums]) => ({
    kind: 'artist',
    name,
    albums: artistAlbums,
    albumCount: artistAlbums.length,
    trackCount: artistAlbums.reduce((count, album) => count + album.tracks.length, 0),
    searchText: joinSearchText([name, ...artistAlbums.map((album) => album.title)])
  }))
}

function buildTrackItems(albums: readonly Album[]): TrackItem[] {
  return albums.flatMap((album) =>
    album.tracks.map((track) => ({
      kind: 'track',
      track,
      album,
      searchText: joinSearchText([track.title, track.artist, album.title])
    }))
  )
}

/**
 * All view and sort definitions live here. Adding a sort is one entry; a new view is one
 * registry entry plus its renderer.
 */
export const VIEWS: ViewDefinitions = {
  albums: {
    label: 'Albums',
    defaultSort: 'title',
    sorts: {
      title: { label: 'Title', compare: compareAlbumTitle },
      artist: { label: 'Artist', compare: compareAlbumArtist },
      year: { label: 'Year', compare: compareAlbumYear }
    },
    build: buildAlbumItems
  },
  artists: {
    label: 'Artists',
    defaultSort: 'name',
    sorts: {
      name: { label: 'Name', compare: (a, b) => compareText(a.name, b.name) },
      tracks: {
        label: 'Track count',
        compare: (a, b) => b.trackCount - a.trackCount || compareText(a.name, b.name)
      }
    },
    build: buildArtistItems
  },
  tracks: {
    label: 'Tracks',
    defaultSort: 'title',
    sorts: {
      title: { label: 'Title', compare: compareTrackTitle },
      artist: { label: 'Artist', compare: compareTrackArtist },
      album: { label: 'Album', compare: compareTrackAlbum }
    },
    build: buildTrackItems
  }
}

export interface LibraryIndex {
  albums: readonly Album[]
  items: {
    [V in LibraryView]: ViewItemMap[V][]
  }
}

/** Build once per library snapshot so every keystroke only filters and sorts. */
export function buildLibraryIndex(albums: readonly Album[]): LibraryIndex {
  return {
    albums,
    items: {
      albums: VIEWS.albums.build(albums),
      artists: VIEWS.artists.build(albums),
      tracks: VIEWS.tracks.build(albums)
    }
  }
}

export interface LibraryQuery<V extends LibraryView> {
  view: V
  search: string
  sort: string
}

export function queryLibrary<V extends LibraryView>(
  index: LibraryIndex,
  query: LibraryQuery<V>
): ViewItemMap[V][] {
  const definition = VIEWS[query.view] as ViewDefinition<ViewItemMap[V]>
  const items = index.items[query.view] as ViewItemMap[V][]
  const sort = definition.sorts[query.sort] ?? definition.sorts[definition.defaultSort]
  return filterBySearch(items, query.search).sort(sort.compare)
}

export function getViewIds(): LibraryView[] {
  return Object.keys(VIEWS) as LibraryView[]
}

export function getSortOptions(view: LibraryView): Array<{ key: string; label: string }> {
  return Object.entries(VIEWS[view].sorts).map(([key, sort]) => ({ key, label: sort.label }))
}

export function getDefaultSort(view: LibraryView): string {
  return VIEWS[view].defaultSort
}

export function isLibraryView(value: unknown): value is LibraryView {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(VIEWS, value)
}

export function isSortKey(view: LibraryView, value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(VIEWS[view].sorts, value)
  )
}

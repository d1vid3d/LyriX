import type { Album, Track } from '../../shared/types'
import type { ArtistItem } from './query'

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

function compareAlbumYearTitle(a: Album, b: Album): number {
  if (a.year === null && b.year === null) return compareText(a.title, b.title)
  if (a.year === null) return 1
  if (b.year === null) return -1
  return a.year - b.year || compareText(a.title, b.title)
}

function compareDiscTrackTitle(a: Track, b: Track): number {
  const discA = a.discNumber ?? 1
  const discB = b.discNumber ?? 1
  if (discA !== discB) return discA - discB

  const trackA = a.trackNumber ?? Number.MAX_SAFE_INTEGER
  const trackB = b.trackNumber ?? Number.MAX_SAFE_INTEGER
  if (trackA !== trackB) return trackA - trackB

  return compareText(a.title, b.title)
}

/** Artist playback order: album year then title, then disc, track number, and title. */
export function getArtistTracks(artist: ArtistItem): Track[] {
  return [...artist.albums]
    .sort(compareAlbumYearTitle)
    .flatMap((album) => [...album.tracks].sort(compareDiscTrackTitle))
}

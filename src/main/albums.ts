import type { Album, Track } from '../shared/types'
import { hashId } from './ids'

/**
 * Pure album grouping. Uses album artist (already artist-fallback) + album name
 * so identical album titles from different artists stay separate.
 */
export function groupTracks(tracks: Track[]): Album[] {
  const groups = new Map<string, Track[]>()

  for (const track of tracks) {
    const key = `${track.albumArtist}\u0000${track.album}`
    const group = groups.get(key)
    if (group) {
      group.push(track)
    } else {
      groups.set(key, [track])
    }
  }

  const albums: Album[] = []
  for (const [key, group] of groups) {
    const sortedTracks = [...group].sort(compareTracks)
    const first = sortedTracks[0]
    const id = hashId(key)

    albums.push({
      id,
      title: first.album,
      artist: first.albumArtist,
      year: sortedTracks.find((track) => track.year !== null)?.year ?? null,
      coverUrl: `media://cover/${id}`,
      tracks: sortedTracks
    })
  }

  albums.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
  )

  return albums
}

function compareTracks(a: Track, b: Track): number {
  const discA = a.discNumber ?? 1
  const discB = b.discNumber ?? 1
  if (discA !== discB) return discA - discB

  const trackA = a.trackNumber ?? Number.MAX_SAFE_INTEGER
  const trackB = b.trackNumber ?? Number.MAX_SAFE_INTEGER
  if (trackA !== trackB) return trackA - trackB

  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
}

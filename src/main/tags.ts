import { basename, extname } from 'node:path'
import { parseFile } from 'music-metadata'
import type { CachedTrack } from '../shared/types'

const UNKNOWN_ARTIST = 'Unknown Artist'
const UNKNOWN_ALBUM = 'Unknown Album'

export async function readTrackTags(
  filePath: string,
  mtimeMs: number,
  size: number
): Promise<CachedTrack> {
  const fallbackTitle = basename(filePath, extname(filePath))

  try {
    const metadata = await parseFile(filePath, { duration: true, skipCovers: true })
    const common = metadata.common
    const artist = cleanText(common.artist) ?? UNKNOWN_ARTIST

    return {
      mtimeMs,
      size,
      title: cleanText(common.title) ?? fallbackTitle,
      artist,
      album: cleanText(common.album) ?? UNKNOWN_ALBUM,
      albumArtist: cleanText(common.albumartist) ?? artist,
      trackNumber: numberOrNull(common.track?.no),
      discNumber: numberOrNull(common.disk?.no),
      year: numberOrNull(common.year),
      duration: durationOrZero(metadata.format.duration)
    }
  } catch (error) {
    // One unreadable file must not abort the scan; use filename-based fallbacks.
    console.warn(
      `[tags] Falling back for ${filePath}:`,
      error instanceof Error ? error.message : error
    )
    return {
      mtimeMs,
      size,
      title: fallbackTitle,
      artist: UNKNOWN_ARTIST,
      album: UNKNOWN_ALBUM,
      albumArtist: UNKNOWN_ARTIST,
      trackNumber: null,
      discNumber: null,
      year: null,
      duration: 0
    }
  }
}

function cleanText(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function durationOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

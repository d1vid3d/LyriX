import type { CachedTrack, LibraryCache } from '../shared/types'
import { readJsonFile, writeJsonAtomic } from './json-file'

export const LIBRARY_CACHE_VERSION = 1

export function emptyLibraryCache(): LibraryCache {
  return { version: LIBRARY_CACHE_VERSION, folder: null, tracks: {} }
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isCachedTrack(value: unknown): value is CachedTrack {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.mtimeMs === 'number' &&
    Number.isFinite(entry.mtimeMs) &&
    typeof entry.size === 'number' &&
    Number.isFinite(entry.size) &&
    typeof entry.title === 'string' &&
    typeof entry.artist === 'string' &&
    typeof entry.album === 'string' &&
    typeof entry.albumArtist === 'string' &&
    isNullableNumber(entry.trackNumber) &&
    isNullableNumber(entry.discNumber) &&
    isNullableNumber(entry.year) &&
    typeof entry.duration === 'number' &&
    Number.isFinite(entry.duration)
  )
}

export async function loadLibraryCache(filePath: string): Promise<LibraryCache> {
  const raw = await readJsonFile<unknown>(filePath, null)
  if (!raw || typeof raw !== 'object') return emptyLibraryCache()

  const cache = raw as Record<string, unknown>
  if (cache.version !== LIBRARY_CACHE_VERSION) return emptyLibraryCache()
  if (cache.folder !== null && typeof cache.folder !== 'string') return emptyLibraryCache()
  if (!cache.tracks || typeof cache.tracks !== 'object' || Array.isArray(cache.tracks)) {
    return emptyLibraryCache()
  }

  // Drop malformed entries rather than failing the whole cache.
  const tracks: Record<string, CachedTrack> = {}
  for (const [filePath, entry] of Object.entries(cache.tracks as Record<string, unknown>)) {
    if (isCachedTrack(entry)) tracks[filePath] = entry
  }

  return { version: LIBRARY_CACHE_VERSION, folder: cache.folder, tracks }
}

export async function saveLibraryCache(filePath: string, cache: LibraryCache): Promise<void> {
  await writeJsonAtomic(filePath, cache)
}

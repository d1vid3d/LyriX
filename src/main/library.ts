import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import type {
  CachedTrack,
  LibraryCache,
  LibrarySnapshot,
  ScanProgress,
  Track
} from '../shared/types'
import { groupTracks } from './albums'
import { hashId } from './ids'
import { readTrackTags } from './tags'

const TAG_CONCURRENCY = 8

interface LibraryState {
  root: string | null
  folderName: string | null
  snapshot: LibrarySnapshot
  trackPaths: Map<string, string>
  albumTrackPaths: Map<string, string[]>
}

interface ScannedFile {
  path: string
  mtimeMs: number
  size: number
}

let state: LibraryState = createState()

function createState(): LibraryState {
  return {
    root: null,
    folderName: null,
    snapshot: { folderName: null, albums: [] },
    trackPaths: new Map(),
    albumTrackPaths: new Map()
  }
}

/** Rebuild the library from cached tags without reading any audio files. */
export function restoreLibrary(
  folder: string | null,
  cache: LibraryCache | null
): LibrarySnapshot {
  state = createState()
  state.root = folder
  state.folderName = folder ? folderLabel(folder) : null

  const entries = folder && cache && cache.folder === folder ? cache.tracks : {}
  return applyEntries(entries)
}

/** Set the active folder and make the scanned entries the current library. */
export function applyLibrary(folder: string, entries: Record<string, CachedTrack>): LibrarySnapshot {
  state.root = folder
  state.folderName = folderLabel(folder)
  return applyEntries(entries)
}

function applyEntries(entries: Record<string, CachedTrack>): LibrarySnapshot {
  const trackPaths = new Map<string, string>()
  const tracks: Track[] = []

  for (const [filePath, entry] of Object.entries(entries)) {
    const id = hashId(filePath)
    trackPaths.set(id, filePath)
    tracks.push({
      id,
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      albumArtist: entry.albumArtist,
      trackNumber: entry.trackNumber,
      discNumber: entry.discNumber,
      year: entry.year,
      duration: entry.duration,
      url: `media://track/${id}`
    })
  }

  const albums = groupTracks(tracks)
  const albumTrackPaths = new Map<string, string[]>()
  for (const album of albums) {
    const paths = album.tracks
      .map((track) => trackPaths.get(track.id))
      .filter((filePath): filePath is string => filePath !== undefined)
    albumTrackPaths.set(album.id, paths)
  }

  state.trackPaths = trackPaths
  state.albumTrackPaths = albumTrackPaths
  state.snapshot = { folderName: state.folderName, albums }
  return state.snapshot
}

/**
 * Walk the folder and reuse cached tags for files whose mtime and size are unchanged.
 * Tag reads run with bounded concurrency; progress counts cached and parsed files alike.
 */
export async function scanLibrary(
  folder: string,
  previous: LibraryCache | null,
  onProgress: (progress: ScanProgress) => void,
  isCancelled: () => boolean
): Promise<Record<string, CachedTrack>> {
  const files = await collectFlacFiles(folder)
  const total = files.length
  const previousEntries = previous && previous.folder === folder ? previous.tracks : {}
  const entries: Record<string, CachedTrack> = {}

  if (total === 0) {
    onProgress({ scanned: 0, total: 0 })
    return entries
  }

  let nextIndex = 0
  let scanned = 0

  const worker = async (): Promise<void> => {
    while (!isCancelled()) {
      const index = nextIndex++
      if (index >= files.length) return

      const file = files[index]
      const cached = previousEntries[file.path]
      let entry: CachedTrack

      if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
        entry = cached
      } else {
        entry = await readTrackTags(file.path, file.mtimeMs, file.size)
      }

      if (isCancelled()) return

      entries[file.path] = entry
      scanned += 1
      onProgress({ scanned, total })
    }
  }

  const workerCount = Math.min(TAG_CONCURRENCY, files.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return entries
}

async function collectFlacFiles(dir: string, files: ScannedFile[] = []): Promise<ScannedFile[]> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (error) {
    console.warn(`[library] Skipping unreadable folder: ${dir}`, error)
    return files
  }

  const subfolders: string[] = []
  for (const entry of entries) {
    // Symlinks are skipped to avoid cycles and files outside the library root.
    if (entry.isSymbolicLink()) continue

    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      subfolders.push(fullPath)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.flac')) {
      try {
        const stats = await fs.stat(fullPath)
        files.push({ path: fullPath, mtimeMs: stats.mtimeMs, size: stats.size })
      } catch (error) {
        console.warn(`[library] Skipping unreadable file: ${fullPath}`, error)
      }
    }
  }

  for (const subfolder of subfolders) {
    await collectFlacFiles(subfolder, files)
  }

  return files
}

function folderLabel(folder: string): string {
  return basename(folder) || folder
}

export function getSnapshot(): LibrarySnapshot {
  return state.snapshot
}

export function getLibraryRoot(): string | null {
  return state.root
}

export function resolveTrackFile(trackId: string): string | null {
  return state.trackPaths.get(trackId) ?? null
}

export function getAlbumTrackPaths(albumId: string): string[] {
  return state.albumTrackPaths.get(albumId) ?? []
}

export function isPathInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

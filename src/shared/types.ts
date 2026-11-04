import type { LyricPreference, LyricSources } from './lyrics/sources'

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNumber: number | null
  discNumber: number | null
  year: number | null
  duration: number
  url: string
}

export interface Album {
  id: string
  title: string
  artist: string
  year: number | null
  coverUrl: string
  tracks: Track[]
}

/** Tag data persisted per file path in the library cache. */
export interface CachedTrack {
  mtimeMs: number
  size: number
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNumber: number | null
  discNumber: number | null
  year: number | null
  duration: number
}

export interface LibraryCache {
  version: number
  folder: string | null
  tracks: Record<string, CachedTrack>
}

/** UI choices persisted between launches. Values are validated by the renderer. */
export interface UiState {
  lastView: string
  sortByView: Record<string, string>
}

export interface Settings extends UiState {
  lastFolder: string | null
  volume: number
  lyricPreference: LyricPreference
}

export interface ScanProgress {
  scanned: number
  total: number
}

export interface LibrarySnapshot {
  folderName: string | null
  albums: Album[]
}

/** API exposed to the renderer through contextBridge. */
export interface LibraryApi {
  getState(): Promise<LibrarySnapshot>
  openFolder(): Promise<LibrarySnapshot | null>
  rescan(): Promise<LibrarySnapshot | null>
  getSettings(): Promise<Settings>
  saveVolume(volume: number): Promise<void>
  saveUiState(state: UiState): Promise<void>
  getLyricSources(trackId: string): Promise<LyricSources | null>
  saveLyricChoice(trackId: string, sourceId: string | null): Promise<void>
  saveLyricPreference(preference: LyricPreference): Promise<void>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
  onLibraryUpdated(listener: (snapshot: LibrarySnapshot) => void): () => void
}

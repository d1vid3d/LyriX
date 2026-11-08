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

export type RepeatMode = 'off' | 'all' | 'one'

/** Playback preferences persisted between launches. */
export interface PlaybackSettingsInput {
  shuffle: boolean
  repeat: RepeatMode
}

export interface Settings extends UiState {
  lastFolder: string | null
  volume: number
  lyricPreference: LyricPreference
  translationEnabled: boolean
  translationLanguage: string | null
  shuffle: boolean
  repeat: RepeatMode
}

/** Input for the translation toggle and sticky language. */
export interface TranslationSettingsInput {
  enabled: boolean
  language: string | null
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
  revealTrack(trackId: string): Promise<boolean>
  getSettings(): Promise<Settings>
  saveVolume(volume: number): Promise<void>
  saveUiState(state: UiState): Promise<void>
  savePlaybackSettings(settings: PlaybackSettingsInput): Promise<void>
  getLyricSources(trackId: string): Promise<LyricSources | null>
  saveLyricChoice(trackId: string, sourceId: string | null): Promise<void>
  saveLyricPreference(preference: LyricPreference): Promise<void>
  saveTranslationChoice(trackId: string, sourceId: string | null): Promise<void>
  saveTranslationSettings(input: TranslationSettingsInput): Promise<void>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
  onLibraryUpdated(listener: (snapshot: LibrarySnapshot) => void): () => void
}

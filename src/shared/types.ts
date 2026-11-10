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

/** The library slice a queue was built from (serialized with the session). */
export interface QueueContext {
  kind: 'album' | 'artist' | 'tracks' | 'search' | 'favorites' | 'recent' | 'other'
  label: string
}

/** How a queue entry entered the queue. */
export type QueueOrigin = 'context' | 'playNext' | 'added'

/** Plain-JSON queue state persisted with the session; tracks are referenced by id. */
export interface SessionQueueEntry {
  entryId: string
  trackId: string
  origin: QueueOrigin
}

export interface SessionQueueState {
  version: 1
  entries: SessionQueueEntry[]
  originalOrder: string[]
  currentEntryId: string | null
  context: QueueContext | null
}

/** Position of the current entry; stored separately so it can be written cheaply. */
export interface SessionPositionState {
  entryId: string
  trackId: string
  position: number
}

/** Session returned to the renderer only when it belongs to the current library folder. */
export interface RestoredSession {
  queue: SessionQueueState
  position: SessionPositionState | null
}

export type MediaKeyAction = 'playpause' | 'next' | 'previous' | 'stop'

/** Machine-local vs library-resident LyrixData state exposed to the renderer. */
export type LyrixDataState =
  'unbound' | 'not-created' | 'ready' | 'read-only' | 'unavailable' | 'newer-version'

export interface LyrixDataStatus {
  state: LyrixDataState
  writable: boolean
  libraryId: string | null
  message: string | null
}

export interface FavoriteMissing {
  path: string
  title: string
  artist: string
  album: string
  addedAt: number
}

export interface FavoriteItem {
  trackId: string
  addedAt: number
}

export interface FavoritesState {
  items: FavoriteItem[]
  missing: FavoriteMissing[]
}

export type FavoritesWriteFailure = 'read-only' | 'unavailable' | 'newer-version' | 'invalid'

export type FavoritesSetResult =
  { ok: true; state: FavoritesState } | { ok: false; reason: FavoritesWriteFailure }

export type HistoryBlockedReason = 'read-only' | 'unavailable' | 'newer-version'

export type HistoryRecordingStatus = 'off' | 'recording' | 'not-created' | 'blocked'

export interface HistoryRecordingState {
  enabled: boolean
  status: HistoryRecordingStatus
  reason: HistoryBlockedReason | null
}

export interface HistoryItem {
  trackId: string
  lastPlayedAt: number
  playCount: number
}

export interface HistoryState {
  recent: HistoryItem[]
  recording: HistoryRecordingState
}

export type HistorySetResult =
  { ok: true; state: HistoryState } | { ok: false; reason: HistoryBlockedReason | 'invalid' }

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
  getSession(): Promise<RestoredSession | null>
  saveSessionQueue(state: SessionQueueState): Promise<void>
  saveSessionPosition(state: SessionPositionState): Promise<void>
  getLyrixDataStatus(): Promise<LyrixDataStatus>
  retryLyrixData(): Promise<LyrixDataStatus>
  getFavorites(): Promise<FavoritesState>
  setFavorite(trackIds: string[], favorite: boolean): Promise<FavoritesSetResult>
  removeMissingFavorites(): Promise<FavoritesSetResult>
  getHistory(options?: { limit?: number }): Promise<HistoryState>
  recordPlay(trackId: string): Promise<{ ok: boolean }>
  setHistoryRecording(enabled: boolean): Promise<HistorySetResult>
  clearHistory(): Promise<HistorySetResult>
  getLyricSources(trackId: string): Promise<LyricSources | null>
  saveLyricChoice(trackId: string, sourceId: string | null): Promise<void>
  saveLyricPreference(preference: LyricPreference): Promise<void>
  saveTranslationChoice(trackId: string, sourceId: string | null): Promise<void>
  saveTranslationSettings(input: TranslationSettingsInput): Promise<void>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
  onLibraryUpdated(listener: (snapshot: LibrarySnapshot) => void): () => void
  onMediaKey(listener: (action: MediaKeyAction) => void): () => void
  onLyrixDataStatus(listener: (status: LyrixDataStatus) => void): () => void
  onFavoritesChanged(listener: (state: FavoritesState) => void): () => void
  onHistoryChanged(listener: (state: HistoryState) => void): () => void
}

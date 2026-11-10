import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { LyricPreference, LyricSources } from '../shared/lyrics/sources'
import type {
  FavoritesSetResult,
  FavoritesState,
  HistorySetResult,
  HistoryState,
  LibraryApi,
  LibrarySnapshot,
  LyrixDataStatus,
  MediaKeyAction,
  PlaybackSettingsInput,
  ScanProgress,
  SessionPositionState,
  SessionQueueState,
  Settings,
  TranslationSettingsInput,
  UiState
} from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const library: LibraryApi = {
  getState: (): Promise<LibrarySnapshot> => ipcRenderer.invoke('library:get-state'),
  openFolder: (): Promise<LibrarySnapshot | null> => ipcRenderer.invoke('library:open-folder'),
  rescan: (): Promise<LibrarySnapshot | null> => ipcRenderer.invoke('library:rescan'),
  revealTrack: (trackId: string): Promise<boolean> =>
    ipcRenderer.invoke('library:reveal-track', trackId),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  getSession: () => ipcRenderer.invoke('session:get'),
  saveSessionQueue: (state: SessionQueueState): Promise<void> =>
    ipcRenderer.invoke('session:save-queue', state),
  saveSessionPosition: (state: SessionPositionState): Promise<void> =>
    ipcRenderer.invoke('session:save-position', state),
  getLyrixDataStatus: (): Promise<LyrixDataStatus> => ipcRenderer.invoke('lyrixdata:get-status'),
  retryLyrixData: (): Promise<LyrixDataStatus> => ipcRenderer.invoke('lyrixdata:retry'),
  getFavorites: (): Promise<FavoritesState> => ipcRenderer.invoke('favorites:get'),
  setFavorite: (trackIds: string[], favorite: boolean): Promise<FavoritesSetResult> =>
    ipcRenderer.invoke('favorites:set', { trackIds, favorite }),
  removeMissingFavorites: (): Promise<FavoritesSetResult> =>
    ipcRenderer.invoke('favorites:remove-missing'),
  getHistory: (options?: { limit?: number }): Promise<HistoryState> =>
    ipcRenderer.invoke('history:get', options),
  recordPlay: (trackId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('history:record', trackId),
  setHistoryRecording: (enabled: boolean): Promise<HistorySetResult> =>
    ipcRenderer.invoke('history:set-recording', enabled),
  clearHistory: (): Promise<HistorySetResult> => ipcRenderer.invoke('history:clear'),
  saveVolume: (volume: number): Promise<void> => ipcRenderer.invoke('settings:set-volume', volume),
  saveUiState: (state: UiState): Promise<void> => ipcRenderer.invoke('settings:set-ui', state),
  savePlaybackSettings: (settings: PlaybackSettingsInput): Promise<void> =>
    ipcRenderer.invoke('settings:set-playback', settings),
  getLyricSources: (trackId: string): Promise<LyricSources | null> =>
    ipcRenderer.invoke('lyrics:get-sources', trackId),
  saveLyricChoice: (trackId: string, sourceId: string | null): Promise<void> =>
    ipcRenderer.invoke('lyrics:set-choice', trackId, sourceId),
  saveLyricPreference: (preference: LyricPreference): Promise<void> =>
    ipcRenderer.invoke('settings:set-lyric-preference', preference),
  saveTranslationChoice: (trackId: string, sourceId: string | null): Promise<void> =>
    ipcRenderer.invoke('lyrics:set-translation-choice', trackId, sourceId),
  saveTranslationSettings: (input: TranslationSettingsInput): Promise<void> =>
    ipcRenderer.invoke('settings:set-translation', input),
  onScanProgress: (listener) => subscribe<ScanProgress>('library:scan-progress', listener),
  onLibraryUpdated: (listener) => subscribe<LibrarySnapshot>('library:updated', listener),
  onMediaKey: (listener) => subscribe<MediaKeyAction>('media:key', listener),
  onLyrixDataStatus: (listener) => subscribe<LyrixDataStatus>('lyrixdata:status-changed', listener),
  onFavoritesChanged: (listener) => subscribe<FavoritesState>('favorites:changed', listener),
  onHistoryChanged: (listener) => subscribe<HistoryState>('history:changed', listener)
}

contextBridge.exposeInMainWorld('library', library)

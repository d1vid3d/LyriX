import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { LyricPreference, LyricSources } from '../shared/lyrics/sources'
import type {
  LibraryApi,
  LibrarySnapshot,
  PlaybackSettingsInput,
  ScanProgress,
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
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveVolume: (volume: number): Promise<void> =>
    ipcRenderer.invoke('settings:set-volume', volume),
  saveUiState: (state: UiState): Promise<void> =>
    ipcRenderer.invoke('settings:set-ui', state),
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
  onLibraryUpdated: (listener) => subscribe<LibrarySnapshot>('library:updated', listener)
}

contextBridge.exposeInMainWorld('library', library)

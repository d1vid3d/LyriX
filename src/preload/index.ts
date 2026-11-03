import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  LibraryApi,
  LibrarySnapshot,
  ScanProgress,
  Settings
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
  onScanProgress: (listener) => subscribe<ScanProgress>('library:scan-progress', listener),
  onLibraryUpdated: (listener) => subscribe<LibrarySnapshot>('library:updated', listener)
}

contextBridge.exposeInMainWorld('library', library)

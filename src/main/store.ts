import type { LibraryCache, Settings } from '../shared/types'
import { emptyLibraryCache } from './cache'

/** Mutable app-wide state shared by the scan coordinator and IPC handlers. */
export interface AppStore {
  settings: Settings
  cache: LibraryCache
  settingsFile: string
  cacheFile: string
}

export function createAppStore(): AppStore {
  return {
    settings: {
      lastFolder: null,
      volume: 1,
      lastView: 'albums',
      sortByView: {}
    },
    cache: emptyLibraryCache(),
    settingsFile: '',
    cacheFile: ''
  }
}

import type { LibraryCache, Settings } from '../shared/types'
import { emptyLibraryCache } from './cache'

/** Mutable app-wide state shared by the scan coordinator and IPC handlers. */
export interface AppStore {
  settings: Settings
  cache: LibraryCache
  settingsFile: string
  cacheFile: string
  lyricChoicesFile: string
}

export function createAppStore(): AppStore {
  return {
    settings: {
      lastFolder: null,
      volume: 1,
      lastView: 'albums',
      sortByView: {},
      lyricPreference: 'sidecar',
      translationEnabled: false,
      translationLanguage: null
    },
    cache: emptyLibraryCache(),
    settingsFile: '',
    cacheFile: '',
    lyricChoicesFile: ''
  }
}

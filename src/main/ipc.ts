import { ipcMain } from 'electron'
import { getSnapshot, resolveTrackFile } from './library'
import { resolveLyrics } from './lyricsSource'
import type { ScanCoordinator } from './scanCoordinator'
import { clampVolume, normalizeUiState, saveSettings } from './settings'
import type { AppStore } from './store'

/** Registers every IPC channel; input validation stays on this side of the bridge. */
export function registerIpc(store: AppStore, scan: ScanCoordinator): void {
  let startupRefreshStarted = false

  ipcMain.handle('library:get-state', () => {
    // The renderer subscribes to events before calling this, so starting the refresh
    // here guarantees the progress/update messages have a listener.
    if (!startupRefreshStarted && store.settings.lastFolder) {
      startupRefreshStarted = true
      setTimeout(() => {
        void scan.refreshInBackground()
      }, 0)
    }
    return getSnapshot()
  })

  ipcMain.handle('library:open-folder', () => scan.chooseFolder())
  ipcMain.handle('library:rescan', () => scan.rescan())

  ipcMain.handle('lyrics:get', async (_event, trackId: unknown) => {
    if (typeof trackId !== 'string' || trackId.length === 0) return null

    try {
      // The renderer only ever sends an id; the path comes from the scanned library.
      const filePath = resolveTrackFile(trackId)
      if (!filePath) return null
      return await resolveLyrics({ id: trackId, filePath })
    } catch (error) {
      console.warn(`[lyrics] Could not load lyrics for ${trackId}`, error)
      return null
    }
  })

  ipcMain.handle('settings:get', () => store.settings)

  ipcMain.handle('settings:set-volume', async (_event, volume: unknown) => {
    store.settings = {
      ...store.settings,
      volume: clampVolume(typeof volume === 'number' ? volume : store.settings.volume)
    }
    try {
      await saveSettings(store.settingsFile, store.settings)
    } catch (error) {
      console.error('[settings] Could not save volume', error)
    }
  })

  ipcMain.handle('settings:set-ui', async (_event, value: unknown) => {
    store.settings = { ...store.settings, ...normalizeUiState(value) }
    try {
      await saveSettings(store.settingsFile, store.settings)
    } catch (error) {
      console.error('[settings] Could not save UI state', error)
    }
  })
}

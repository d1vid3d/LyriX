import { ipcMain } from 'electron'
import { getSnapshot, resolveTrackFile } from './library'
import { isValidLyricSourceId, isValidTrackId } from './lyrics/choices'
import type { LyricChoiceStore } from './lyrics/choices'
import { getLyricSources } from './lyrics/sources'
import type { ScanCoordinator } from './scanCoordinator'
import { clampVolume, normalizeUiState, saveSettings } from './settings'
import type { AppStore } from './store'

/** Registers every IPC channel; input validation stays on this side of the bridge. */
export function registerIpc(
  store: AppStore,
  scan: ScanCoordinator,
  choices: LyricChoiceStore
): void {
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

  ipcMain.handle('lyrics:get-sources', async (_event, trackId: unknown) => {
    if (!isValidTrackId(trackId)) return null

    try {
      // The renderer only ever sends an id; the path comes from the scanned library.
      const filePath = resolveTrackFile(trackId)
      if (!filePath) return null
      return await getLyricSources(
        { id: trackId, filePath },
        {
          savedChoice: choices.get(trackId),
          preference: store.settings.lyricPreference
        }
      )
    } catch (error) {
      console.warn(`[lyrics] Could not load lyric sources for ${trackId}`, error)
      return null
    }
  })

  ipcMain.handle('lyrics:set-choice', async (_event, trackId: unknown, sourceId: unknown) => {
    if (!isValidTrackId(trackId)) return

    try {
      if (sourceId === null) {
        await choices.clear(trackId)
        return
      }
      if (!isValidLyricSourceId(sourceId)) return
      await choices.set(trackId, sourceId)
    } catch (error) {
      console.error(`[lyrics] Could not save the lyric choice for ${trackId}`, error)
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

  ipcMain.handle('settings:set-lyric-preference', async (_event, preference: unknown) => {
    if (preference !== 'sidecar' && preference !== 'embedded') return

    store.settings = { ...store.settings, lyricPreference: preference }
    try {
      await saveSettings(store.settingsFile, store.settings)
    } catch (error) {
      console.error('[settings] Could not save lyric preference', error)
    }
  })
}

import { ipcMain } from 'electron'
import { getSnapshot, resolveTrackFile } from './library'
import { parseFavoriteSetInput } from './lyrixdata/favoritesIpc'
import type { FavoritesStore } from './lyrixdata/favoritesStore'
import type { HistoryStore } from './lyrixdata/historyStore'
import {
  parseHistoryGetInput,
  parseHistoryRecordInput,
  parseHistoryRecordingInput
} from './lyrixdata/historyIpc'
import type { LyrixDataStore } from './lyrixdata/lyrixDataStore'
import { isValidLyricSourceId, isValidTrackId } from './lyrics/choices'
import type { LyricChoiceStore } from './lyrics/choices'
import { getLyricSources } from './lyrics/sources'
import { revealTrackFile } from './reveal'
import type { ScanCoordinator } from './scanCoordinator'
import type { SessionStore } from './sessionStore'
import type { TranslationSettingsInput } from '../shared/types'
import {
  clampVolume,
  normalizeRepeat,
  normalizeShuffle,
  normalizeTranslationLanguage,
  normalizeUiState,
  saveSettings
} from './settings'
import type { AppStore } from './store'

/** Registers every IPC channel; input validation stays on this side of the bridge. */
export function registerIpc(
  store: AppStore,
  scan: ScanCoordinator,
  choices: LyricChoiceStore,
  session: SessionStore,
  lyrixData: LyrixDataStore,
  favorites: FavoritesStore,
  history: HistoryStore
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

  ipcMain.handle('library:reveal-track', async (_event, trackId: unknown) => {
    // The renderer sends an id only; reveal.ts resolves and validates the path.
    return revealTrackFile(trackId)
  })

  ipcMain.handle('session:get', () => session.getSession())

  ipcMain.handle('session:save-queue', (_event, value: unknown) => {
    // sessionStore validates ids, caps, origins, and the context; no paths are accepted.
    session.updateQueue(value)
  })

  ipcMain.handle('session:save-position', (_event, value: unknown) => {
    session.updatePosition(value)
  })

  ipcMain.handle('lyrixdata:get-status', () => lyrixData.getStatus())

  ipcMain.handle('lyrixdata:retry', async () => {
    try {
      return await lyrixData.retry()
    } catch (error) {
      console.error('[lyrixdata] Retry failed', error)
      return lyrixData.getStatus()
    }
  })

  ipcMain.handle('favorites:get', () => favorites.getState())

  ipcMain.handle('favorites:set', async (_event, value: unknown) => {
    const input = parseFavoriteSetInput(value)
    if (!input) return { ok: false, reason: 'invalid' }

    try {
      return input.favorite
        ? await favorites.add(input.trackIds)
        : await favorites.remove(input.trackIds)
    } catch (error) {
      console.error('[favorites] Could not update favorites', error)
      return { ok: false, reason: 'unavailable' }
    }
  })

  ipcMain.handle('favorites:remove-missing', async () => {
    try {
      return await favorites.removeAllMissing()
    } catch (error) {
      console.error('[favorites] Could not remove missing favorites', error)
      return { ok: false, reason: 'unavailable' }
    }
  })

  ipcMain.handle('history:get', async (_event, value: unknown) => {
    try {
      return await history.read(parseHistoryGetInput(value).limit)
    } catch (error) {
      console.error('[history] Could not read play history', error)
      return history.getState()
    }
  })

  ipcMain.handle('history:record', async (_event, value: unknown) => {
    const trackId = parseHistoryRecordInput(value)
    if (!trackId) return { ok: false }

    try {
      return await history.record(trackId)
    } catch (error) {
      console.error('[history] Could not record a play', error)
      return { ok: false }
    }
  })

  ipcMain.handle('history:set-recording', async (_event, value: unknown) => {
    const enabled = parseHistoryRecordingInput(value)
    if (enabled === null) return { ok: false, reason: 'invalid' }

    try {
      return await history.setRecording(enabled)
    } catch (error) {
      console.error('[history] Could not change history recording', error)
      return { ok: false, reason: 'unavailable' }
    }
  })

  ipcMain.handle('history:clear', async () => {
    try {
      return await history.clear()
    } catch (error) {
      console.error('[history] Could not clear play history', error)
      return { ok: false, reason: 'unavailable' }
    }
  })

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
          savedTranslationChoice: choices.getTranslation(trackId),
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

  ipcMain.handle(
    'lyrics:set-translation-choice',
    async (_event, trackId: unknown, sourceId: unknown) => {
      if (!isValidTrackId(trackId)) return

      try {
        if (sourceId === null) {
          await choices.clearTranslation(trackId)
          return
        }
        if (!isValidLyricSourceId(sourceId)) return
        await choices.setTranslation(trackId, sourceId)
      } catch (error) {
        console.error(`[lyrics] Could not save the translation choice for ${trackId}`, error)
      }
    }
  )

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

  ipcMain.handle('settings:set-playback', async (_event, value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return

    const candidate = value as Record<string, unknown>
    store.settings = {
      ...store.settings,
      shuffle: normalizeShuffle(candidate.shuffle),
      repeat: normalizeRepeat(candidate.repeat)
    }
    try {
      await saveSettings(store.settingsFile, store.settings)
    } catch (error) {
      console.error('[settings] Could not save playback settings', error)
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

  ipcMain.handle('settings:set-translation', async (_event, value: unknown) => {
    const input = parseTranslationSettings(value)
    if (!input) return

    store.settings = {
      ...store.settings,
      translationEnabled: input.enabled,
      translationLanguage: input.language
    }
    try {
      await saveSettings(store.settingsFile, store.settings)
    } catch (error) {
      console.error('[settings] Could not save translation settings', error)
    }
  })
}

function parseTranslationSettings(value: unknown): TranslationSettingsInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const candidate = value as Record<string, unknown>
  if (typeof candidate.enabled !== 'boolean') return null
  if (candidate.language !== null && typeof candidate.language !== 'string') return null

  const language =
    candidate.language === null ? null : normalizeTranslationLanguage(candidate.language)
  if (candidate.language !== null && language === null) return null

  return { enabled: candidate.enabled, language }
}

import { app, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { MEDIA_KEY_MODE } from '../shared/mediaKeys'
import { loadLibraryCache } from './cache'
import { CoverService } from './covers'
import { registerIpc } from './ipc'
import { getLibraryRoot, getSnapshot, resolveTrackFile, restoreLibrary } from './library'
import { FavoritesStore } from './lyrixdata/favoritesStore'
import { nodeFsAdapter } from './lyrixdata/fsAdapter'
import { HistoryStore } from './lyrixdata/historyStore'
import { LyrixDataStore } from './lyrixdata/lyrixDataStore'
import { loadOrCreateMachineId } from './lyrixdata/machineId'
import { LyricChoiceStore } from './lyrics/choices'
import { registerGlobalMediaKeys, unregisterGlobalMediaKeys } from './mediaKeys'
import { handleMediaProtocol, registerMediaScheme } from './media-protocol'
import { ScanCoordinator } from './scanCoordinator'
import { SessionStore } from './sessionStore'
import { loadSettings } from './settings'
import { createAppStore } from './store'
import { WindowManager } from './window'
import { loadWindowState } from './windowState'

// Keep development's profile (settings, cache, session, single-instance lock) separate from an
// installed build and inside the writable project folder. E2E launches the built app without this
// env var, so its explicit userData isolation is untouched.
if (process.env['ELECTRON_RENDERER_URL']) {
  app.setPath('userData', join(app.getAppPath(), '.lyrix-dev'))
}

// Privileged schemes must be registered before the app is ready.
registerMediaScheme()

// Only one process may own the data files (settings, cache, session, window state).
const primaryInstance = app.requestSingleInstanceLock()

const store = createAppStore()
const windows = new WindowManager(join(app.getPath('userData'), 'window-state.json'))

if (!primaryInstance) {
  console.warn('[app] Another LyriX instance is already running; focusing it and exiting.')
  app.quit()
} else {
  app.on('second-instance', () => windows.focusOrCreate())

  if (MEDIA_KEY_MODE === 'media-session') {
    // Chromium's Media Session service wires hardware keys and the Windows media overlay.
    app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService')
  }

  app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId('com.lyrix.player')

      const userData = app.getPath('userData')
      store.settingsFile = join(userData, 'settings.json')
      store.cacheFile = join(userData, 'library-cache.json')
      store.lyricChoicesFile = join(userData, 'lyric-choices.json')

      store.settings = await loadSettings(store.settingsFile)
      store.cache = await loadLibraryCache(store.cacheFile)

      const choices = new LyricChoiceStore(store.lyricChoicesFile)
      await choices.load()

      let root: string | null = null
      if (store.settings.lastFolder) {
        try {
          root = await fs.realpath(store.settings.lastFolder)
        } catch {
          root = store.settings.lastFolder
        }
      }
      restoreLibrary(root, store.cache)

      const machineId = await loadOrCreateMachineId(join(userData, 'machine-id.json'))
      const lyrixData = new LyrixDataStore({
        fs: nodeFsAdapter,
        machineId,
        appVersion: app.getVersion(),
        onStatusChange: (status) => windows.send('lyrixdata:status-changed', status)
      })
      await lyrixData.bind(root)

      const favorites = new FavoritesStore({
        store: lyrixData,
        resolveTrackFile,
        onStateChange: (state) => windows.send('favorites:changed', state)
      })
      await favorites.setLibrary(root, getSnapshot().albums)

      const history = new HistoryStore({
        store: lyrixData,
        resolveTrackFile,
        onStateChange: (state) => windows.send('history:changed', state)
      })
      await history.setLibrary(root, getSnapshot().albums)

      const savedWindow = await loadWindowState(join(userData, 'window-state.json'))
      const session = new SessionStore(
        join(userData, 'session-queue.json'),
        join(userData, 'session-position.json'),
        getLibraryRoot
      )
      await session.load()

      handleMediaProtocol(new CoverService(join(userData, 'covers')))

      const scan = new ScanCoordinator(store, windows, async (snapshot) => {
        const folder = getLibraryRoot()
        await lyrixData.bind(folder)
        await favorites.setLibrary(folder, snapshot.albums)
        await history.setLibrary(folder, snapshot.albums)
      })
      registerIpc(store, scan, choices, session, lyrixData, favorites, history)

      if (MEDIA_KEY_MODE === 'global-shortcuts') {
        registerGlobalMediaKeys((action) => windows.send('media:key', action))
      }

      windows.createWindow(savedWindow)

      let flushed = false
      app.on('before-quit', (event) => {
        if (flushed) return
        event.preventDefault()
        flushed = true
        void Promise.all([session.flush(), lyrixData.flush()])
          .catch(() => undefined)
          .finally(() => app.quit())
      })

      app.on('will-quit', () => unregisterGlobalMediaKeys())

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) windows.createWindow()
      })
    })
    .catch((error) => {
      console.error('[app] Failed to start', error)
      app.quit()
    })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

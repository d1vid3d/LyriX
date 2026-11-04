import { app, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { loadLibraryCache } from './cache'
import { CoverService } from './covers'
import { registerIpc } from './ipc'
import { restoreLibrary } from './library'
import { LyricChoiceStore } from './lyrics/choices'
import { handleMediaProtocol, registerMediaScheme } from './media-protocol'
import { ScanCoordinator } from './scanCoordinator'
import { loadSettings } from './settings'
import { createAppStore } from './store'
import { WindowManager } from './window'

// Privileged schemes must be registered before the app is ready.
registerMediaScheme()

const store = createAppStore()
const windows = new WindowManager()

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

    handleMediaProtocol(new CoverService(join(userData, 'covers')))

    const scan = new ScanCoordinator(store, windows)
    registerIpc(store, scan, choices)
    windows.createWindow()

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

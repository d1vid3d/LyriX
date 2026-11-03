import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { LibraryCache, LibrarySnapshot, ScanProgress, Settings } from '../shared/types'
import {
  emptyLibraryCache,
  LIBRARY_CACHE_VERSION,
  loadLibraryCache,
  saveLibraryCache
} from './cache'
import { CoverService } from './covers'
import {
  applyLibrary,
  getLibraryRoot,
  getSnapshot,
  restoreLibrary,
  scanLibrary
} from './library'
import { handleMediaProtocol, registerMediaScheme } from './media-protocol'
import { clampVolume, loadSettings, saveSettings } from './settings'

// Privileged schemes must be registered before the app is ready.
registerMediaScheme()

let mainWindow: BrowserWindow | null = null

let settings: Settings = { lastFolder: null, volume: 1 }
let cache: LibraryCache = emptyLibraryCache()
let settingsFile = ''
let cacheFile = ''

let scanGeneration = 0
let startupRefreshStarted = false
let lastProgressAt = 0

interface ScanOutcome {
  snapshot: LibrarySnapshot
  stale: boolean
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 620,
    minHeight: 440,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#141414',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function sendProgress(progress: ScanProgress): void {
  const now = Date.now()
  if (progress.scanned < progress.total && now - lastProgressAt < 100) return

  lastProgressAt = now
  sendToRenderer('library:scan-progress', progress)
}

async function runScan(folder: string, persistFolder: boolean): Promise<ScanOutcome> {
  const generation = ++scanGeneration
  lastProgressAt = 0
  const isCancelled = (): boolean => generation !== scanGeneration

  const entries = await scanLibrary(
    folder,
    cache,
    (progress) => {
      if (!isCancelled()) sendProgress(progress)
    },
    isCancelled
  )

  if (isCancelled()) return { snapshot: getSnapshot(), stale: true }

  const snapshot = applyLibrary(folder, entries)
  cache = { version: LIBRARY_CACHE_VERSION, folder, tracks: entries }

  try {
    await saveLibraryCache(cacheFile, cache)
  } catch (error) {
    console.error('[library] Could not save the library cache', error)
  }

  if (persistFolder) {
    settings = { ...settings, lastFolder: folder }
    try {
      await saveSettings(settingsFile, settings)
    } catch (error) {
      console.error('[settings] Could not save settings', error)
    }
  }

  return { snapshot, stale: false }
}

async function chooseFolder(): Promise<LibrarySnapshot | null> {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow
  const options: Electron.OpenDialogOptions = {
    title: 'Open music folder',
    properties: ['openDirectory']
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) return null

  let folder = result.filePaths[0]
  try {
    folder = await fs.realpath(folder)
  } catch {
    // Keep the selected path; scanning will report it as unreadable.
  }

  return (await runScan(folder, true)).snapshot
}

async function rescan(): Promise<LibrarySnapshot | null> {
  const root = getLibraryRoot()
  if (!root) return null
  return (await runScan(root, false)).snapshot
}

async function refreshInBackground(): Promise<void> {
  const root = getLibraryRoot()
  if (!root) return

  try {
    const outcome = await runScan(root, false)
    if (!outcome.stale) sendToRenderer('library:updated', outcome.snapshot)
  } catch (error) {
    console.error('[library] Background refresh failed', error)
  }
}

function registerIpc(): void {
  ipcMain.handle('library:get-state', () => {
    // The renderer subscribes to events before calling this, so starting the refresh
    // here guarantees the progress/update messages have a listener.
    if (!startupRefreshStarted && settings.lastFolder) {
      startupRefreshStarted = true
      setTimeout(() => {
        void refreshInBackground()
      }, 0)
    }
    return getSnapshot()
  })

  ipcMain.handle('library:open-folder', () => chooseFolder())
  ipcMain.handle('library:rescan', () => rescan())
  ipcMain.handle('settings:get', () => settings)

  ipcMain.handle('settings:set-volume', async (_event, volume: unknown) => {
    settings = {
      ...settings,
      volume: clampVolume(typeof volume === 'number' ? volume : settings.volume)
    }
    try {
      await saveSettings(settingsFile, settings)
    } catch (error) {
      console.error('[settings] Could not save volume', error)
    }
  })
}

app
  .whenReady()
  .then(async () => {
    app.setAppUserModelId('com.lyrix.player')

    const userData = app.getPath('userData')
    settingsFile = join(userData, 'settings.json')
    cacheFile = join(userData, 'library-cache.json')

    settings = await loadSettings(settingsFile)
    cache = await loadLibraryCache(cacheFile)

    let root: string | null = null
    if (settings.lastFolder) {
      try {
        root = await fs.realpath(settings.lastFolder)
      } catch {
        root = settings.lastFolder
      }
    }
    restoreLibrary(root, cache)

    handleMediaProtocol(new CoverService(join(userData, 'covers')))
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error) => {
    console.error('[app] Failed to start', error)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

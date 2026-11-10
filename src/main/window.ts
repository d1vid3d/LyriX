import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { resolveWindowBounds } from './windowBounds'
import type { DisplayInfo, Rect } from './windowBounds'
import { WindowStateWriter } from './windowState'
import type { StoredWindowState } from './windowState'

const DEFAULT_BOUNDS: Rect = { x: 0, y: 0, width: 1040, height: 760 }
const MIN_SIZE = { width: 620, height: 440 }

/** Owns the single application window and all sends to its renderer. */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private stateWriter: WindowStateWriter | null = null
  private lastState: StoredWindowState | null = null
  private readonly stateFile: string

  constructor(stateFile: string) {
    this.stateFile = stateFile
  }

  createWindow(saved: StoredWindowState | null = null): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) return

    const displays = currentDisplays()
    const resolved = resolveWindowBounds(saved, displays, DEFAULT_BOUNDS, MIN_SIZE)
    this.lastState = saved

    const window = new BrowserWindow({
      x: resolved.bounds.x,
      y: resolved.bounds.y,
      width: resolved.bounds.width,
      height: resolved.bounds.height,
      minWidth: MIN_SIZE.width,
      minHeight: MIN_SIZE.height,
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
    this.mainWindow = window

    this.stateWriter = new WindowStateWriter(this.stateFile)
    const scheduleSave = (): void => this.saveState(window, false)
    window.on('resize', scheduleSave)
    window.on('move', scheduleSave)
    window.on('maximize', scheduleSave)
    window.on('unmaximize', scheduleSave)
    window.on('close', () => this.saveState(window, true))

    window.on('ready-to-show', () => {
      if (resolved.maximized) window.maximize()
      window.show()
    })
    window.on('closed', () => {
      this.stateWriter?.cancel()
      this.stateWriter = null
      this.mainWindow = null
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  /** Focuses the existing window for a second launch, restoring it if minimized. */
  focusOrCreate(): void {
    const window = this.mainWindow
    if (!window || window.isDestroyed()) {
      if (app.isReady()) this.createWindow(this.lastState)
      else void app.whenReady().then(() => this.focusOrCreate())
      return
    }

    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    window.focus()
  }

  getWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  send(channel: string, payload: unknown): void {
    if (
      !this.mainWindow ||
      this.mainWindow.isDestroyed() ||
      this.mainWindow.webContents.isDestroyed()
    ) {
      return
    }
    this.mainWindow.webContents.send(channel, payload)
  }

  private saveState(window: BrowserWindow, flush: boolean): void {
    if (window.isDestroyed()) return

    const state: StoredWindowState = {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized()
    }
    this.lastState = state

    if (!this.stateWriter) return
    if (flush) this.stateWriter.flush(state)
    else this.stateWriter.schedule(state)
  }
}

function currentDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((display) => ({
    workArea: display.workArea,
    primary: display.id === primaryId
  }))
}

import { BrowserWindow } from 'electron'
import { join } from 'node:path'

/** Owns the single application window and all sends to its renderer. */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null

  createWindow(): void {
    this.mainWindow = new BrowserWindow({
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

    this.mainWindow.on('ready-to-show', () => this.mainWindow?.show())
    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
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
}

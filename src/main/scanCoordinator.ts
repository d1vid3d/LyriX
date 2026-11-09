import { BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import type { LibrarySnapshot, ScanProgress } from '../shared/types'
import { LIBRARY_CACHE_VERSION, saveLibraryCache } from './cache'
import { applyLibrary, getLibraryRoot, getSnapshot, scanLibrary } from './library'
import { saveSettings } from './settings'
import type { AppStore } from './store'

export interface ScanOutcome {
  snapshot: LibrarySnapshot
  stale: boolean
}

/** The window operations a scan needs: dialog parenting and renderer events. */
export interface ScanWindow {
  getWindow(): BrowserWindow | null
  send(channel: string, payload: unknown): void
}

/** Owns the scan generation counter, progress throttling, and folder persistence. */
export class ScanCoordinator {
  private scanGeneration = 0
  private lastProgressAt = 0

  constructor(
    private readonly store: AppStore,
    private readonly window: ScanWindow,
    private readonly onLibraryApplied?: (
      snapshot: LibrarySnapshot
    ) => Promise<void> | void
  ) {}

  async runScan(folder: string, persistFolder: boolean): Promise<ScanOutcome> {
    const generation = ++this.scanGeneration
    this.lastProgressAt = 0
    const isCancelled = (): boolean => generation !== this.scanGeneration

    const entries = await scanLibrary(
      folder,
      this.store.cache,
      (progress) => {
        if (!isCancelled()) this.sendProgress(progress)
      },
      isCancelled
    )

    if (isCancelled()) return { snapshot: getSnapshot(), stale: true }

    const snapshot = applyLibrary(folder, entries)
    this.store.cache = { version: LIBRARY_CACHE_VERSION, folder, tracks: entries }

    try {
      await this.onLibraryApplied?.(snapshot)
    } catch (error) {
      console.error('[library] Could not bind LyrixData for the new library', error)
    }
    try {
      await saveLibraryCache(this.store.cacheFile, this.store.cache)
    } catch (error) {
      console.error('[library] Could not save the library cache', error)
    }

    if (persistFolder) {
      this.store.settings = { ...this.store.settings, lastFolder: folder }
      try {
        await saveSettings(this.store.settingsFile, this.store.settings)
      } catch (error) {
        console.error('[settings] Could not save settings', error)
      }
    }

    return { snapshot, stale: false }
  }

  async chooseFolder(): Promise<LibrarySnapshot | null> {
    const window = BrowserWindow.getFocusedWindow() ?? this.window.getWindow()
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

    return (await this.runScan(folder, true)).snapshot
  }

  async rescan(): Promise<LibrarySnapshot | null> {
    const root = getLibraryRoot()
    if (!root) return null
    return (await this.runScan(root, false)).snapshot
  }

  async refreshInBackground(): Promise<void> {
    const root = getLibraryRoot()
    if (!root) return

    try {
      const outcome = await this.runScan(root, false)
      if (!outcome.stale) this.window.send('library:updated', outcome.snapshot)
    } catch (error) {
      console.error('[library] Background refresh failed', error)
    }
  }

  private sendProgress(progress: ScanProgress): void {
    const now = Date.now()
    if (progress.scanned < progress.total && now - this.lastProgressAt < 100) return

    this.lastProgressAt = now
    this.window.send('library:scan-progress', progress)
  }
}

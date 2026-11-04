import type {
  LibrarySnapshot,
  ScanProgress,
  Settings,
  Track
} from '../../shared/types'
import type { LibraryApi } from '../../shared/types'
import { buildLibraryIndex } from '../library/query'
import type { LibraryIndex } from '../library/query'
import type { AppElements } from './dom'
import type { DetailRoute } from './routeStack'

export interface LibraryNavigation {
  resetStack(): void
  pruneInvalidRoutes(isValid: (route: DetailRoute) => boolean): void
}

export interface LibraryTransport {
  reconcileQueue(): void
  resetPlayback(): void
}

export interface LibraryNowPlaying {
  isOpen(): boolean
  markDirty(): void
}

export interface LibraryDeps {
  elements: AppElements
  api: LibraryApi
  navigation: LibraryNavigation
  transport: LibraryTransport
  nowPlaying: LibraryNowPlaying
  refreshScreen(): void
  updateNowPlaying(): void
  updateTrackHighlight(): void
  updateControls(): void
  leaveNowPlaying(): void
  applySettings(settings: Settings): void
  refreshLyrics(): void
}

/** Owns the library snapshot, status text, scanning state, and startup ordering. */
export class LibraryController {
  private readonly deps: LibraryDeps
  private albums: LibrarySnapshot['albums'] = []
  private libraryIndex: LibraryIndex = buildLibraryIndex([])
  private folderName: string | null = null
  private libraryEventReceived = false

  constructor(deps: LibraryDeps) {
    this.deps = deps
    deps.elements.openFolderButton.addEventListener('click', () => {
      void this.openFolder()
    })
    deps.elements.rescanButton.addEventListener('click', () => {
      void this.rescanLibrary()
    })
  }

  getAlbums(): LibrarySnapshot['albums'] {
    return this.albums
  }

  getLibraryIndex(): LibraryIndex {
    return this.libraryIndex
  }

  getFolderName(): string | null {
    return this.folderName
  }

  emptyMessage(): string {
    if (this.albums.length === 0) {
      return this.folderName
        ? 'No .flac files found in that folder.'
        : 'Open a folder to list its .flac files.'
    }
    return 'No results.'
  }

  findAlbumForTrack(track: Track): LibrarySnapshot['albums'][number] | null {
    return this.albums.find((album) => album.tracks.some((item) => item.id === track.id)) ?? null
  }

  applySnapshot(snapshot: LibrarySnapshot): void {
    this.albums = snapshot.albums
    this.libraryIndex = buildLibraryIndex(this.albums)
    this.folderName = snapshot.folderName

    this.deps.transport.reconcileQueue()
    this.updateStatus()

    this.deps.navigation.pruneInvalidRoutes((route) => this.detailExists(route))

    if (this.deps.nowPlaying.isOpen()) this.deps.nowPlaying.markDirty()

    this.deps.refreshLyrics()
    this.deps.refreshScreen()
    this.deps.updateNowPlaying()
    this.deps.updateTrackHighlight()
    this.deps.updateControls()
    this.setScanning(false)
  }

  handleLibraryUpdated(snapshot: LibrarySnapshot): void {
    this.libraryEventReceived = true
    this.applySnapshot(snapshot)
  }

  handleProgress(progress: ScanProgress): void {
    const { elements } = this.deps
    elements.openFolderButton.disabled = true
    elements.rescanButton.disabled = true
    elements.progressLabel.hidden = false
    elements.progressLabel.textContent =
      progress.total > 0 ? `Scanning ${progress.scanned} / ${progress.total}` : 'Scanning…'
  }

  async initialize(): Promise<void> {
    try {
      const settings = await this.deps.api.getSettings()
      this.deps.applySettings(settings)
    } catch (error) {
      console.error('[renderer] Could not load settings', error)
    }

    try {
      const snapshot = await this.deps.api.getState()
      // A background refresh event may beat the getState response; don't overwrite fresher data.
      if (!this.libraryEventReceived) this.applySnapshot(snapshot)
    } catch (error) {
      console.error('[renderer] Could not load library', error)
      this.deps.elements.statusLabel.textContent = 'Could not load the library.'
    }
  }

  /** Subscribes to scan progress and library updates; returns one disposer for both. */
  start(): () => void {
    const unsubscribeProgress = this.deps.api.onScanProgress((progress) =>
      this.handleProgress(progress)
    )
    const unsubscribeUpdated = this.deps.api.onLibraryUpdated((snapshot) =>
      this.handleLibraryUpdated(snapshot)
    )
    return () => {
      unsubscribeProgress()
      unsubscribeUpdated()
    }
  }

  private async openFolder(): Promise<void> {
    this.setScanning(true)

    try {
      const snapshot = await this.deps.api.openFolder()
      if (!snapshot) {
        this.setScanning(false)
        return
      }

      this.deps.leaveNowPlaying()
      this.deps.transport.resetPlayback()
      this.deps.navigation.resetStack()
      this.applySnapshot(snapshot)
    } catch (error) {
      console.error('[renderer] Open folder failed', error)
      this.deps.elements.statusLabel.textContent = 'Could not open that folder.'
      this.setScanning(false)
    }
  }

  private async rescanLibrary(): Promise<void> {
    this.setScanning(true)

    try {
      const snapshot = await this.deps.api.rescan()
      if (snapshot) this.applySnapshot(snapshot)
      else this.setScanning(false)
    } catch (error) {
      console.error('[renderer] Rescan failed', error)
      this.deps.elements.statusLabel.textContent = 'Could not rescan that folder.'
      this.setScanning(false)
    }
  }

  private setScanning(scanning: boolean): void {
    const { elements } = this.deps
    elements.openFolderButton.disabled = scanning
    elements.rescanButton.disabled = scanning || this.folderName === null

    if (!scanning) {
      elements.progressLabel.hidden = true
      elements.progressLabel.textContent = ''
    }
  }

  private updateStatus(): void {
    const { elements } = this.deps

    if (!this.folderName) {
      elements.statusLabel.textContent = 'No folder selected'
      return
    }

    const trackCount = this.albums.reduce((count, album) => count + album.tracks.length, 0)
    const albumLabel = this.albums.length === 1 ? '1 album' : `${this.albums.length} albums`
    const trackLabel = trackCount === 1 ? '1 track' : `${trackCount} tracks`
    elements.statusLabel.textContent = `${this.folderName} · ${albumLabel} · ${trackLabel}`
  }

  private detailExists(route: DetailRoute): boolean {
    if (route.kind === 'album') {
      return this.albums.some((album) => album.id === route.albumId)
    }
    return this.libraryIndex.items.artists.some((artist) => artist.name === route.artistName)
  }
}

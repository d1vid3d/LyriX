import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { LyrixDataStatus } from '../../shared/types'
import type { FsAdapter, FsFailureReason } from './fsAdapter'
import { classifyFsError, isNotFound } from './fsAdapter'
import {
  FAVORITES_FILE_VERSION,
  LIBRARY_FILE_VERSION,
  makeWrittenBy,
  validateFavoritesFile,
  validateLibraryFile
} from './formats'
import type { FavoritesFile, FavoritesFileItem, LibraryFile } from './formats'
import {
  findLyrixDataDirName,
  LYRIXDATA_DIR_NAME,
  README_CONTENT
} from './paths'
import { VersionedStore } from './versionedStore'

export interface LyrixDataStoreOptions {
  fs: FsAdapter
  machineId: string
  appVersion: string
  onStatusChange(status: LyrixDataStatus): void
}

export type FavoritesFileWriteResult =
  | { ok: true }
  | { ok: false; reason: FsFailureReason | 'newer-version' }

const README_NAME = 'README.txt'
const LIBRARY_NAME = 'library.json'
const FAVORITES_NAME = 'favorites.json'

/**
 * One bound LyrixData folder. Every path is captured per bind and every write carries a generation
 * guard, so a slow operation from library A can never land in library B. Reads are always allowed.
 */
export class LyrixDataStore {
  private readonly options: LyrixDataStoreOptions
  private root: string | null = null
  private dirName = LYRIXDATA_DIR_NAME
  private dirPath: string | null = null
  private generation = 0
  private libraryId: string | null = null
  private libraryStore: VersionedStore<LibraryFile> | null = null
  private favoritesStore: VersionedStore<FavoritesFile> | null = null
  private status: LyrixDataStatus = {
    state: 'unbound',
    writable: false,
    libraryId: null,
    message: null
  }
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(options: LyrixDataStoreOptions) {
    this.options = options
  }

  getStatus(): LyrixDataStatus {
    return this.status
  }

  getLibraryId(): string | null {
    return this.libraryId
  }

  getRoot(): string | null {
    return this.root
  }

  async bind(root: string | null): Promise<LyrixDataStatus> {
    const generation = ++this.generation
    this.root = root
    this.dirName = LYRIXDATA_DIR_NAME
    this.dirPath = null
    this.libraryId = null
    this.libraryStore = null
    this.favoritesStore = null

    if (!root) {
      this.setStatus({
        state: 'unbound',
        writable: false,
        libraryId: null,
        message: null
      })
      return this.status
    }

    try {
      const entries = await this.options.fs.readdir(root)
      if (generation !== this.generation) return this.status

      const found = findLyrixDataDirName(entries.map((entry) => entry.name))
      if (!found) {
        this.prepareStores(LYRIXDATA_DIR_NAME)
        this.setStatus({
          state: 'not-created',
          writable: true,
          libraryId: null,
          message: null
        })
        return this.status
      }

      this.dirName = found
      this.prepareStores(found)
      await this.detectExisting(generation)
      return this.status
    } catch (error) {
      if (generation !== this.generation) return this.status
      this.fail(classifyFsError(error), error)
      return this.status
    }
  }

  /** Creates the folder, README, and library.json on the first write only. */
  async ensureCreated(): Promise<boolean> {
    const generation = this.generation
    const root = this.root
    const dirPath = this.dirPath

    return this.enqueue(async () => {
      if (!root || !dirPath) {
        this.setStatus({ state: 'unbound', writable: false, libraryId: null, message: null })
        return false
      }
      if (generation !== this.generation) return false
      if (this.status.state === 'newer-version') return false

      try {
        await this.options.fs.mkdir(dirPath)
        const stats = await this.options.fs.lstat(dirPath)
        if (generation !== this.generation) return false
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          this.setStatus({
            state: 'read-only',
            writable: false,
            libraryId: this.libraryId,
            message: 'The LyrixData folder is a symbolic link, so LyriX will not use it.'
          })
          return false
        }

        if (!(await this.exists(join(dirPath, README_NAME)))) {
          await this.options.fs.writeFile(join(dirPath, README_NAME), README_CONTENT)
        }

        const store = this.libraryStore
        if (!store) return false

        const read = await store.read()
        if (generation !== this.generation) return false

        let library = read.value
        if (!library) {
          library = {
            version: LIBRARY_FILE_VERSION,
            libraryId: randomUUID(),
            createdAt: Date.now(),
            writtenBy: makeWrittenBy(this.options.appVersion, this.options.machineId)
          }
          const write = await store.write(library)
          if (generation !== this.generation) return false
          if (!write.ok) {
            this.failWrite(write.reason)
            return false
          }
        }

        this.libraryId = library.libraryId
        this.setStatus({
          state: 'ready',
          writable: true,
          libraryId: library.libraryId,
          message: null
        })
        return true
      } catch (error) {
        if (generation !== this.generation) return false
        this.fail(classifyFsError(error), error)
        return false
      }
    })
  }

  async readFavorites(): Promise<{
    items: FavoritesFileItem[]
    newerVersion: boolean
  }> {
    const store = this.favoritesStore
    if (!store) return { items: [], newerVersion: false }

    const read = await store.read()
    if (!read.value) return { items: [], newerVersion: read.newerVersion }
    return {
      items: read.value.items,
      newerVersion: read.newerVersion
    }
  }

  async writeFavorites(items: FavoritesFileItem[]): Promise<FavoritesFileWriteResult> {
    const created = await this.ensureCreated()
    if (!created) {
      const state = this.status.state
      if (state === 'read-only') return { ok: false, reason: 'read-only' }
      if (state === 'newer-version') return { ok: false, reason: 'newer-version' }
      return { ok: false, reason: 'unavailable' }
    }

    const generation = this.generation
    return this.enqueue(async () => {
      if (generation !== this.generation) return { ok: false, reason: 'unavailable' }

      const store = this.favoritesStore
      if (!store) return { ok: false, reason: 'unavailable' }

      const payload: FavoritesFile = {
        version: FAVORITES_FILE_VERSION,
        items,
        writtenBy: makeWrittenBy(this.options.appVersion, this.options.machineId)
      }
      const result = await store.write(payload)
      if (generation !== this.generation) return { ok: false, reason: 'unavailable' }
      if (!result.ok) {
        this.failWrite(result.reason, result.message)
        return { ok: false, reason: result.reason }
      }
      return { ok: true }
    })
  }

  /** Clears a cached failure/re-detects and retries the first-write creation. */
  async retry(): Promise<LyrixDataStatus> {
    const root = this.root
    const status = await this.bind(root)
    if (status.state === 'not-created' || status.state === 'ready') {
      await this.ensureCreated()
    }
    return this.status
  }

  /** Waits for queued LyrixData writes; called before quit. */
  async flush(): Promise<void> {
    await this.writeChain
  }

  private async detectExisting(generation: number): Promise<void> {
    const dirPath = this.dirPath
    if (!dirPath) return

    let stats
    try {
      stats = await this.options.fs.lstat(dirPath)
    } catch (error) {
      if (generation !== this.generation) return
      this.fail(classifyFsError(error), error)
      return
    }
    if (generation !== this.generation) return

    if (stats.isSymbolicLink()) {
      this.setStatus({
        state: 'read-only',
        writable: false,
        libraryId: null,
        message: 'The LyrixData folder is a symbolic link, so LyriX will not use it.'
      })
      return
    }
    if (!stats.isDirectory()) {
      this.setStatus({
        state: 'unavailable',
        writable: false,
        libraryId: null,
        message: 'The LyrixData path is not a folder.'
      })
      return
    }

    const libraryStore = this.libraryStore
    if (!libraryStore) return

    const libraryRead = await libraryStore.read()
    if (generation !== this.generation) return

    if (libraryRead.value) this.libraryId = libraryRead.value.libraryId
    if (libraryRead.newerVersion) {
      this.setStatus({
        state: 'newer-version',
        writable: false,
        libraryId: this.libraryId,
        message: null
      })
      return
    }

    const favoritesStore = this.favoritesStore
    if (favoritesStore) {
      const favoritesRead = await favoritesStore.read()
      if (generation !== this.generation) return
      if (favoritesRead.newerVersion) {
        this.setStatus({
          state: 'newer-version',
          writable: false,
          libraryId: this.libraryId,
          message: null
        })
        return
      }
    }

    this.setStatus({
      state: libraryRead.value ? 'ready' : 'not-created',
      writable: true,
      libraryId: this.libraryId,
      message: null
    })
  }

  private prepareStores(dirName: string): void {
    const root = this.root
    if (!root) return

    const dirPath = join(root, dirName)
    this.dirName = dirName
    this.dirPath = dirPath
    this.libraryStore = new VersionedStore<LibraryFile>({
      filePath: join(dirPath, LIBRARY_NAME),
      currentVersion: LIBRARY_FILE_VERSION,
      fs: this.options.fs,
      validate: validateLibraryFile
    })
    this.favoritesStore = new VersionedStore<FavoritesFile>({
      filePath: join(dirPath, FAVORITES_NAME),
      currentVersion: FAVORITES_FILE_VERSION,
      fs: this.options.fs,
      validate: validateFavoritesFile
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeChain.then(operation, operation)
    this.writeChain = result.catch(() => undefined)
    return result
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await this.options.fs.stat(path)
      return true
    } catch (error) {
      if (isNotFound(error)) return false
      throw error
    }
  }

  private failWrite(reason: FsFailureReason | 'newer-version', message?: string): void {
    if (reason === 'newer-version') {
      this.setStatus({
        state: 'newer-version',
        writable: false,
        libraryId: this.libraryId,
        message: null
      })
      return
    }
    this.setStatus({
      state: reason,
      writable: false,
      libraryId: this.libraryId,
      message: reason === 'unavailable' ? message ?? null : null
    })
  }

  private fail(reason: FsFailureReason, error: unknown): void {
    this.setStatus({
      state: reason,
      writable: false,
      libraryId: this.libraryId,
      message:
        reason === 'unavailable'
          ? error instanceof Error
            ? error.message
            : String(error)
          : null
    })
  }

  private setStatus(status: LyrixDataStatus): void {
    this.status = status
    this.options.onStatusChange(status)
  }
}

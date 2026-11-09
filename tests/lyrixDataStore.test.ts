import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FsAdapter, FsDirEntry } from '../src/main/lyrixdata/fsAdapter'
import { LyrixDataStore } from '../src/main/lyrixdata/lyrixDataStore'

class FakeFs implements FsAdapter {
  files = new Map<string, string>()
  directories = new Set<string>()
  symlinks = new Set<string>()
  failWrites = new Map<string, string>()
  writeCount = 0
  blockWritePath: string | null = null
  private blocker: Promise<void> | null = null
  private release: (() => void) | null = null

  blockNextWrite(path: string): void {
    this.blockWritePath = path
    this.blocker = new Promise((resolve) => {
      this.release = resolve
    })
    this.blocked = new Promise((resolve) => {
      this.blockedResolve = resolve
    })
  }

  blocked: Promise<void> = Promise.resolve()
  private blockedResolve: (() => void) | null = null

  finishBlockedWrite(): void {
    this.release?.()
    this.blocker = null
    this.release = null
    this.blockWritePath = null
  }

  async readFile(path: string): Promise<string> {
    const value = this.files.get(path)
    if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return value
  }

  async writeFile(path: string, data: string): Promise<void> {
    const failure = this.failWrites.get(path)
    if (failure) throw Object.assign(new Error('failed'), { code: failure })
    if (this.blockWritePath === path && this.blocker) {
      this.blockedResolve?.()
      await this.blocker
    }
    this.writeCount += 1
    this.files.set(path, data)
  }

  async rename(from: string, to: string): Promise<void> {
    const failure = this.failWrites.get(to)
    if (failure) throw Object.assign(new Error('failed'), { code: failure })
    const value = this.files.get(from)
    if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    this.files.set(to, value)
    this.files.delete(from)
  }

  async rm(path: string, options?: { force?: boolean }): Promise<void> {
    if (!this.files.delete(path) && !options?.force) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    }
  }

  async mkdir(path: string): Promise<void> {
    let current = path
    while (current !== dirname(current)) {
      this.directories.add(current)
      current = dirname(current)
    }
  }

  async stat(path: string): Promise<{ size: number; isFile(): boolean }> {
    const value = this.files.get(path)
    if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return { size: Buffer.byteLength(value), isFile: () => true }
  }

  async lstat(
    path: string
  ): Promise<{
    size: number
    isFile(): boolean
    isSymbolicLink(): boolean
    isDirectory(): boolean
  }> {
    if (this.symlinks.has(path)) {
      return {
        size: 0,
        isFile: () => false,
        isSymbolicLink: () => true,
        isDirectory: () => false
      }
    }
    if (this.directories.has(path)) {
      return {
        size: 0,
        isFile: () => false,
        isSymbolicLink: () => false,
        isDirectory: () => true
      }
    }
    const stats = await this.stat(path)
    return { ...stats, isSymbolicLink: () => false, isDirectory: () => false }
  }

  async readdir(path: string): Promise<FsDirEntry[]> {
    const names = new Set<string>()
    for (const file of this.files.keys()) {
      const parent = dirname(file)
      if (parent === path) names.add(file.slice(path.length + 1))
    }
    for (const dir of this.directories) {
      if (dir !== path && dirname(dir) === path) names.add(dir.slice(path.length + 1))
    }
    for (const link of this.symlinks) {
      if (dirname(link) === path) names.add(link.slice(path.length + 1))
    }
    return [...names].map((name) => ({
      name,
      isDirectory: () => this.directories.has(join(path, name)),
      isSymbolicLink: () => this.symlinks.has(join(path, name))
    }))
  }

  async realpath(path: string): Promise<string> {
    return path
  }
}

const rootA = join('root-a')
const rootB = join('root-b')

function makeStore(fs: FakeFs) {
  const statuses: string[] = []
  const store = new LyrixDataStore({
    fs,
    machineId: '11111111-1111-4111-8111-111111111111',
    appVersion: '0.1.0',
    onStatusChange: (status) => statuses.push(status.state)
  })
  return { store, statuses }
}

describe('LyrixDataStore', () => {
  it('never creates anything on bind or read', async () => {
    const fs = new FakeFs()
    fs.directories.add(rootA)
    const { store } = makeStore(fs)
    expect((await store.bind(rootA)).state).toBe('not-created')
    expect((await store.readFavorites()).items).toEqual([])
    expect(fs.writeCount).toBe(0)
    expect([...fs.directories].some((path) => path.includes('LyrixData'))).toBe(false)
  })

  it('creates the folder, README, and library.json on the first write', async () => {
    const fs = new FakeFs()
    fs.directories.add(rootA)
    const { store } = makeStore(fs)
    await store.bind(rootA)

    const result = await store.writeFavorites([])
    expect(result).toEqual({ ok: true })
    const dir = join(rootA, 'LyrixData')
    expect(fs.directories.has(dir)).toBe(true)
    expect(fs.files.has(join(dir, 'README.txt'))).toBe(true)
    const library = JSON.parse(fs.files.get(join(dir, 'library.json')) ?? '{}')
    expect(library.version).toBe(1)
    expect(library.writtenBy.app).toBe('LyriX')
    expect(store.getStatus()).toMatchObject({ state: 'ready', writable: true })
    expect(store.getLibraryId()).toBe(library.libraryId)
  })

  it('keeps the library id stable across rebinds', async () => {
    const fs = new FakeFs()
    fs.directories.add(rootA)
    const { store } = makeStore(fs)
    await store.bind(rootA)
    await store.writeFavorites([])
    const id = store.getLibraryId()

    expect((await store.bind(null)).state).toBe('unbound')
    expect((await store.bind(rootA)).state).toBe('ready')
    expect(store.getLibraryId()).toBe(id)
  })

  it('classifies read-only and unavailable failures and retries', async () => {
    const fs = new FakeFs()
    fs.directories.add(rootA)
    const dir = join(rootA, 'LyrixData')
    fs.failWrites.set(join(dir, 'README.txt'), 'EROFS')
    const { store } = makeStore(fs)
    await store.bind(rootA)

    expect(await store.writeFavorites([])).toEqual({ ok: false, reason: 'read-only' })
    expect(store.getStatus().state).toBe('read-only')

    fs.failWrites.clear()
    await store.retry()
    expect(store.getStatus().state).toBe('ready')

    fs.failWrites.set(join(dir, 'favorites.json'), 'EIO')
    const unavailable = await store.writeFavorites([{ ref: { path: 'x.flac', fp: { title: 'X', artist: 'A', album: 'B', durationSec: 1 } }, addedAt: 1 }])
    expect(unavailable).toEqual({ ok: false, reason: 'unavailable' })
    expect(store.getStatus().state).toBe('unavailable')
    expect(store.getStatus().message).toBeTruthy()
  })

  it('drops a write begun for library A after rebinding to B', async () => {
    const fs = new FakeFs()
    fs.directories.add(rootA)
    fs.directories.add(rootB)
    const { store } = makeStore(fs)
    await store.bind(rootA)

    const dirA = join(rootA, 'LyrixData')
    fs.blockNextWrite(join(dirA, 'README.txt'))
    const pending = store.writeFavorites([])
    await fs.blocked

    await store.bind(rootB)
    fs.finishBlockedWrite()

    expect(await pending).toEqual({ ok: false, reason: 'unavailable' })
    expect(fs.files.has(join(rootB, 'LyrixData', 'library.json'))).toBe(false)
    expect(fs.files.has(join(rootB, 'LyrixData', 'favorites.json'))).toBe(false)
  })

  it('serializes concurrent writes so the last queued payload wins', async () => {
    const fs = new FakeFs()
    fs.directories.add(rootA)
    const { store } = makeStore(fs)
    await store.bind(rootA)
    await store.writeFavorites([])
    const dir = join(rootA, 'LyrixData')

    const ref = {
      path: 'Song.flac',
      fp: { title: 'Song', artist: 'Artist', album: 'Album', durationSec: 10 }
    }
    const prefix = { version: 1, writtenBy: { app: 'LyriX' } }
    const first = { ...prefix, items: [{ ref, addedAt: 1 }] }
    const second = { ...prefix, items: [{ ref, addedAt: 2 }] }
    const [a, b] = await Promise.all([
      store.writeFavorites([...first.items]),
      store.writeFavorites([...second.items])
    ])
    expect(a).toEqual({ ok: true })
    expect(b).toEqual({ ok: true })
    const saved = JSON.parse(fs.files.get(join(dir, 'favorites.json')) ?? '{}')
    expect(saved.items[0].addedAt).toBe(2)
  })

  it('refuses a symlinked LyrixData directory', async () => {
    const fs = new FakeFs()
    fs.directories.add(rootA)
    fs.symlinks.add(join(rootA, 'LyrixData'))
    const { store } = makeStore(fs)

    const status = await store.bind(rootA)
    expect(status.state).toBe('read-only')
    expect(await store.writeFavorites([])).toEqual({ ok: false, reason: 'read-only' })
  })
})

import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FsAdapter } from '../src/main/lyrixdata/fsAdapter'
import { VersionedStore } from '../src/main/lyrixdata/versionedStore'

interface MemoryValue {
  version: number
  items?: string[]
  [key: string]: unknown
}

class MemoryFs implements FsAdapter {
  files = new Map<string, string>()
  failWriteCode: string | null = null

  async readFile(path: string): Promise<string> {
    const value = this.files.get(path)
    if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return value
  }

  async writeFile(path: string, data: string): Promise<void> {
    if (this.failWriteCode) {
      throw Object.assign(new Error('write failed'), { code: this.failWriteCode })
    }
    this.files.set(path, data)
  }

  async rename(from: string, to: string): Promise<void> {
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

  async mkdir(): Promise<void> {
    return undefined
  }

  async stat(path: string): Promise<{ size: number; isFile(): boolean }> {
    const value = this.files.get(path)
    if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return { size: Buffer.byteLength(value), isFile: () => true }
  }

  async lstat(path: string): Promise<{
    size: number
    isFile(): boolean
    isSymbolicLink(): boolean
    isDirectory(): boolean
  }> {
    const stats = await this.stat(path)
    return { ...stats, isSymbolicLink: () => false, isDirectory: () => false }
  }

  async readdir(): Promise<Array<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }>> {
    return []
  }

  async realpath(path: string): Promise<string> {
    return path
  }
}

function isValue(value: unknown): value is MemoryValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { version?: unknown }).version === 'number' &&
    Array.isArray((value as { items?: unknown }).items)
  )
}

const filePath = join('root', 'LyrixData', 'favorites.json')

function createStore(fs: MemoryFs) {
  return new VersionedStore<MemoryValue>({
    filePath,
    currentVersion: 1,
    fs,
    validate: isValue
  })
}

describe('VersionedStore', () => {
  it('round-trips and writes the previous file to .bak atomically', async () => {
    const fs = new MemoryFs()
    const store = createStore(fs)
    const first = { version: 1, items: ['a'], writtenBy: { app: 'LyriX' } }
    expect(await store.write(first)).toEqual({ ok: true })

    const second = { version: 1, items: ['b'], writtenBy: { app: 'LyriX' } }
    expect(await store.write(second)).toEqual({ ok: true })

    expect(JSON.parse(fs.files.get(filePath) ?? '{}').items).toEqual(['b'])
    expect(JSON.parse(fs.files.get(`${filePath}.bak`) ?? '{}').items).toEqual(['a'])
    expect([...fs.files.keys()].some((path) => path.endsWith('.tmp'))).toBe(false)
  })

  it('preserves unknown top-level fields on rewrite', async () => {
    const fs = new MemoryFs()
    fs.files.set(
      filePath,
      JSON.stringify({ version: 1, items: [], futureField: 'keep me', writtenBy: { app: 'LyriX' } })
    )
    const store = createStore(fs)
    const read = await store.read()
    expect(read.value).not.toBeNull()

    await store.write({ version: 1, items: ['a'], writtenBy: { app: 'LyriX' } })
    const payload = JSON.parse(fs.files.get(filePath) ?? '{}')
    expect(payload.futureField).toBe('keep me')
    expect(payload.items).toEqual(['a'])
  })

  it('falls back to .bak when the main file is corrupt', async () => {
    const fs = new MemoryFs()
    fs.files.set(filePath, 'not json')
    fs.files.set(`${filePath}.bak`, JSON.stringify({ version: 1, items: ['backup'] }))
    const store = createStore(fs)
    const read = await store.read()
    expect(read.value?.items).toEqual(['backup'])
    expect(read.newerVersion).toBe(false)
  })

  it('returns empty when both copies are corrupt', async () => {
    const fs = new MemoryFs()
    fs.files.set(filePath, 'not json')
    fs.files.set(`${filePath}.bak`, '{')
    const read = await createStore(fs).read()
    expect(read.value).toBeNull()
  })

  it('reads a newer version tolerantly but refuses to write it', async () => {
    const fs = new MemoryFs()
    fs.files.set(filePath, JSON.stringify({ version: 9, items: ['future'] }))
    const store = createStore(fs)
    const read = await store.read()
    expect(read.newerVersion).toBe(true)
    expect(read.value?.items).toEqual(['future'])
    expect(await store.write({ version: 1, items: [] })).toEqual({
      ok: false,
      reason: 'newer-version'
    })
  })

  it('treats oversized files as unreadable and cleans up failed writes', async () => {
    const fs = new MemoryFs()
    fs.files.set(filePath, JSON.stringify({ version: 1, items: ['huge'] }))
    const realStat = fs.stat.bind(fs)
    fs.stat = async (path: string) => {
      const stats = await realStat(path)
      return { ...stats, size: 11 * 1024 * 1024 }
    }
    expect((await createStore(fs).read()).value).toBeNull()

    const failing = new MemoryFs()
    failing.failWriteCode = 'EACCES'
    const result = await createStore(failing).write({ version: 1, items: [] })
    expect(result).toMatchObject({ ok: false, reason: 'read-only' })
    expect([...failing.files.keys()].some((path) => path.endsWith('.tmp'))).toBe(false)
  })
})

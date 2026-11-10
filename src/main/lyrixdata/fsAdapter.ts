import { promises as fs } from 'node:fs'

export interface FsStats {
  size: number
  isFile(): boolean
}

export interface FsDirEntry {
  name: string
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

/** Injectable filesystem surface so tests can simulate failures without OS tricks. */
export interface FsAdapter {
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
  appendFile(path: string, data: string): Promise<void>
  /** Reads at most the last `maxBytes` of a file as UTF-8. */
  readTail(path: string, maxBytes: number): Promise<string>
  rename(from: string, to: string): Promise<void>
  rm(path: string, options?: { force?: boolean }): Promise<void>
  mkdir(path: string): Promise<void>
  stat(path: string): Promise<FsStats>
  lstat(path: string): Promise<FsStats & { isSymbolicLink(): boolean; isDirectory(): boolean }>
  readdir(path: string): Promise<FsDirEntry[]>
  realpath(path: string): Promise<string>
}

export const nodeFsAdapter: FsAdapter = {
  readFile: (path) => fs.readFile(path, 'utf8'),
  writeFile: (path, data) => fs.writeFile(path, data),
  appendFile: (path, data) => fs.appendFile(path, data),
  readTail: async (path, maxBytes) => {
    const stats = await fs.stat(path)
    const start = Math.max(0, stats.size - Math.max(0, maxBytes))
    const length = stats.size - start
    if (length === 0) return ''

    const handle = await fs.open(path, 'r')
    try {
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, start)
      return buffer.toString('utf8')
    } finally {
      await handle.close()
    }
  },
  rename: (from, to) => fs.rename(from, to),
  rm: (path, options) => fs.rm(path, { force: options?.force ?? false }),
  mkdir: (path) => fs.mkdir(path, { recursive: true }).then(() => undefined),
  stat: async (path) => {
    const stats = await fs.stat(path)
    return { size: stats.size, isFile: () => stats.isFile() }
  },
  lstat: async (path) => {
    const stats = await fs.lstat(path)
    return {
      size: stats.size,
      isFile: () => stats.isFile(),
      isSymbolicLink: () => stats.isSymbolicLink(),
      isDirectory: () => stats.isDirectory()
    }
  },
  readdir: async (path) => {
    const entries = await fs.readdir(path, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: () => entry.isDirectory(),
      isSymbolicLink: () => entry.isSymbolicLink()
    }))
  },
  realpath: (path) => fs.realpath(path)
}

export type FsFailureReason = 'read-only' | 'unavailable'

/** Maps filesystem error codes to the status classes owned by the LyrixData store. */
export function classifyFsError(error: unknown): FsFailureReason {
  const code = (error as NodeJS.ErrnoException | null)?.code
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return 'read-only'
  return 'unavailable'
}

export function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

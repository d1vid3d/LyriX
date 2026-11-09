import { dirname } from 'node:path'
import type { FsAdapter, FsFailureReason } from './fsAdapter'
import { classifyFsError, isNotFound } from './fsAdapter'

export const MAX_STORE_BYTES = 10 * 1024 * 1024

export interface VersionedValue {
  version: number
}

export interface VersionedRead<T> {
  value: T | null
  newerVersion: boolean
}

export type VersionedWriteResult =
  | { ok: true }
  | { ok: false; reason: FsFailureReason | 'newer-version'; message?: string }

export interface VersionedStoreOptions<T extends VersionedValue> {
  filePath: string
  currentVersion: number
  fs: FsAdapter
  validate(value: unknown): value is T
}

interface ParsedRecord {
  value: unknown
  record: Record<string, unknown>
  version: number
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Safe versioned JSON file. Reads tolerate a corrupt main file by falling back to `.bak`; a version
 * newer than this app reads tolerantly but refuses writes. Writes preserve unknown top-level fields,
 * go through a temp file, and keep the previous file as `.bak`.
 */
export class VersionedStore<T extends VersionedValue> {
  private readonly filePath: string
  private readonly currentVersion: number
  private readonly fs: FsAdapter
  private readonly validate: (value: unknown) => value is T
  private lastRaw: Record<string, unknown> | null = null
  private newer = false

  constructor(options: VersionedStoreOptions<T>) {
    this.filePath = options.filePath
    this.currentVersion = options.currentVersion
    this.fs = options.fs
    this.validate = options.validate
  }

  get backupPath(): string {
    return `${this.filePath}.bak`
  }

  isNewerVersion(): boolean {
    return this.newer
  }

  async read(): Promise<VersionedRead<T>> {
    const main = await this.parseCandidate(this.filePath)
    if (main) return this.accept(main)

    const backup = await this.parseCandidate(this.backupPath)
    if (backup) return this.accept(backup)

    this.lastRaw = null
    this.newer = false
    return { value: null, newerVersion: false }
  }

  async write(value: T): Promise<VersionedWriteResult> {
    if (this.newer) return { ok: false, reason: 'newer-version' }

    const payload: Record<string, unknown> = {
      ...(this.lastRaw ?? {}),
      ...value,
      version: this.currentVersion
    }
    const data = JSON.stringify(payload, null, 2)
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`

    try {
      await this.fs.mkdir(dirname(this.filePath))
      await this.fs.writeFile(tempPath, data)

      let targetExists = false
      try {
        targetExists = (await this.fs.stat(this.filePath)).isFile()
      } catch (error) {
        if (!isNotFound(error)) throw error
      }

      if (targetExists) {
        await this.fs.rm(this.backupPath, { force: true })
        await this.fs.rename(this.filePath, this.backupPath)
      }
      await this.fs.rename(tempPath, this.filePath)

      this.lastRaw = payload
      this.newer = false
      return { ok: true }
    } catch (error) {
      await this.fs.rm(tempPath, { force: true }).catch(() => undefined)
      return {
        ok: false,
        reason: classifyFsError(error),
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private accept(parsed: ParsedRecord): VersionedRead<T> {
    this.lastRaw = parsed.record
    this.newer = parsed.version > this.currentVersion
    return {
      value: parsed.value === null ? null : (parsed.value as T),
      newerVersion: this.newer
    }
  }

  private async parseCandidate(path: string): Promise<ParsedRecord | null> {
    try {
      const stats = await this.fs.stat(path)
      if (!stats.isFile() || stats.size > MAX_STORE_BYTES) return null

      const raw = await this.fs.readFile(path)
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed) || typeof parsed.version !== 'number') return null

      const valid = this.validate(parsed)
      // A newer schema may be unreadable by this app, but it must never be overwritten.
      if (!valid && parsed.version <= this.currentVersion) return null

      return {
        value: valid ? parsed : null,
        record: parsed,
        version: parsed.version
      }
    } catch {
      return null
    }
  }
}

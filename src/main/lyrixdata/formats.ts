import type { TrackRef } from './trackRef'

export const LIBRARY_FILE_VERSION = 1
export const FAVORITES_FILE_VERSION = 1

/** Flip this to opt new/legacy libraries into history recording by default. */
export const DEFAULT_HISTORY_RECORDING = false

export interface LibraryFile {
  version: number
  libraryId: string
  createdAt: number
  writtenBy: WrittenBy
  /** Missing means DEFAULT_HISTORY_RECORDING. */
  historyRecording?: boolean
}

export interface WrittenBy {
  app: string
  appVersion: string
  machineId: string
  at: number
}

export interface LibraryFile {
  version: number
  libraryId: string
  createdAt: number
  writtenBy: WrittenBy
}

export interface FavoritesFileItem {
  ref: TrackRef
  addedAt: number
  /** Unknown fields from a newer writer are preserved on rewrite. */
  [key: string]: unknown
}

export interface FavoritesFile {
  version: number
  items: FavoritesFileItem[]
  writtenBy: WrittenBy
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isWrittenBy(value: unknown): value is WrittenBy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.app === 'LyriX' &&
    typeof candidate.appVersion === 'string' &&
    typeof candidate.machineId === 'string' &&
    typeof candidate.at === 'number' &&
    Number.isFinite(candidate.at)
  )
}

export function makeWrittenBy(appVersion: string, machineId: string): WrittenBy {
  return { app: 'LyriX', appVersion, machineId, at: Date.now() }
}

/** A missing flag uses the single named default; only `true` enables recording. */
export function historyRecordingFromLibrary(library: LibraryFile | null): boolean {
  if (!library || typeof library.historyRecording !== 'boolean') {
    return DEFAULT_HISTORY_RECORDING
  }
  return library.historyRecording === true
}

export function isValidLibraryId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function validateLibraryFile(value: unknown): value is LibraryFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.version === 'number' &&
    isValidLibraryId(candidate.libraryId) &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    isWrittenBy(candidate.writtenBy)
  )
}

export function validateFavoritesFile(value: unknown): value is FavoritesFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.version === 'number' &&
    Array.isArray(candidate.items) &&
    isWrittenBy(candidate.writtenBy)
  )
}

export function isValidRefPath(path: unknown): path is string {
  if (typeof path !== 'string' || path === '' || path.length > 1024) return false
  const normalized = path.replace(/\\/g, '/').normalize('NFC')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return false
  return !normalized.split('/').some((part) => part === '..' || part === '')
}

/** Basic shape check for a stored favorite item; newer unknown fields are kept. */
export function isValidFavoriteItem(value: unknown): value is FavoritesFileItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const ref = candidate.ref
  if (typeof ref !== 'object' || ref === null || Array.isArray(ref)) return false
  const refCandidate = ref as Record<string, unknown>
  if (!isValidRefPath(refCandidate.path)) return false
  const fp = refCandidate.fp
  if (typeof fp !== 'object' || fp === null || Array.isArray(fp)) return false
  const fingerprint = fp as Record<string, unknown>
  return (
    typeof candidate.addedAt === 'number' &&
    Number.isFinite(candidate.addedAt) &&
    typeof fingerprint.title === 'string' &&
    typeof fingerprint.artist === 'string' &&
    typeof fingerprint.album === 'string' &&
    typeof fingerprint.durationSec === 'number' &&
    Number.isFinite(fingerprint.durationSec)
  )
}

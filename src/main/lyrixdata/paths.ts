import { isAbsolute, relative, sep } from 'node:path'

export const LYRIXDATA_DIR_NAME = 'LyrixData'

/** Only these files may ever be read or written inside LyrixData. */
export const LYRIXDATA_FILE_ALLOWLIST: ReadonlySet<string> = new Set([
  'README.txt',
  'library.json',
  'favorites.json',
  'history.jsonl'
])

export const README_CONTENT =
  'Created by LyriX. Safe to back up or delete. Deleting it resets favorites, history, and playlists.\n'

/** Case-insensitive LyrixData directory detection at a library root. */
export function findLyrixDataDirName(names: readonly string[]): string | null {
  return names.find((name) => name.toLowerCase() === LYRIXDATA_DIR_NAME.toLowerCase()) ?? null
}

export function isLyrixDataDirName(name: string): boolean {
  return name.toLowerCase() === LYRIXDATA_DIR_NAME.toLowerCase()
}

export function isAllowedLyrixDataFile(name: string): boolean {
  return LYRIXDATA_FILE_ALLOWLIST.has(name)
}

/**
 * Normalizes an absolute path to the portable reference form: relative to the library root,
 * forward slashes, Unicode NFC. Returns `null` for paths outside the root.
 */
export function toPortableLibraryPath(root: string, filePath: string): string | null {
  const rel = relative(root, filePath)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return rel.split(sep).join('/').normalize('NFC')
}

/** Portable path normalization for stored refs (already relative). */
export function normalizeRefPath(path: string): string {
  return path.replace(/\\/g, '/').normalize('NFC')
}

/** Case-insensitive lookup key for a portable ref path. */
export function refPathKey(path: string): string {
  return normalizeRefPath(path).toLowerCase()
}

/** True when a normalized ref path cannot escape its library root. */
export function isSafeRefPath(path: string): boolean {
  const normalized = normalizeRefPath(path)
  if (normalized === '' || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return false
  }
  return !normalized.split('/').some((part) => part === '..')
}

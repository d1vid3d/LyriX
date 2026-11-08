import { isAbsolute, relative, sep } from 'node:path'

/** True only when `target` is a strict descendant of `root`. */
export function isPathInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * Pure reveal guard. Callers pass canonical (realpath) values; this only checks that a FLAC file
 * is strictly inside the selected library root. The IPC handler still validates the id and stats
 * the file before asking the OS to reveal it.
 */
export function isRevealPathAllowed(root: string | null, filePath: string | null): boolean {
  if (!root || !filePath) return false
  if (!filePath.toLowerCase().endsWith('.flac')) return false
  return isPathInside(root, filePath)
}

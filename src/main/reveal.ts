import { shell } from 'electron'
import { promises as fs } from 'node:fs'
import { isValidTrackId } from './lyrics/choices'
import { getLibraryRoot, resolveTrackFile } from './library'
import { isRevealPathAllowed } from './pathContainment'

/**
 * Reveals a scanned track in the OS file manager. The renderer only sends an id; the path,
 * containment check, and file check all happen here.
 */
export async function revealTrackFile(trackId: unknown): Promise<boolean> {
  if (!isValidTrackId(trackId)) return false

  const indexedPath = resolveTrackFile(trackId)
  const root = getLibraryRoot()
  if (!indexedPath || !root) return false

  try {
    // Re-check canonical paths so a replaced symlink cannot escape the selected folder.
    const [filePath, realRoot] = await Promise.all([fs.realpath(indexedPath), fs.realpath(root)])
    if (!isRevealPathAllowed(realRoot, filePath)) return false

    const stats = await fs.stat(filePath)
    if (!stats.isFile()) return false

    shell.showItemInFolder(filePath)
    return true
  } catch (error) {
    console.warn(`[reveal] Could not show ${trackId} in the file manager`, error)
    return false
  }
}

import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

export const MAX_SIDECAR_BYTES = 1024 * 1024

export interface SidecarLyrics {
  /** File name only, never a full path. */
  fileName: string
  text: string
  exact: boolean
  /** Text between "<base>." and ".lrc" for variant files, otherwise null. */
  variant: string | null
}

/**
 * Finds lyric sidecars in the track's own directory. Names are compared case-insensitively with
 * NFC normalization; symlinks, directories, and files over 1 MiB are skipped.
 */
export async function findSidecars(trackFilePath: string): Promise<SidecarLyrics[]> {
  const directory = dirname(trackFilePath)
  const base = normalizeName(basename(trackFilePath, extname(trackFilePath)))
  const lowerBase = base.toLowerCase()

  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    console.warn(`[lyrics] Could not read sidecar directory: ${directory}`, error)
    return []
  }

  const sidecars: SidecarLyrics[] = []

  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.isDirectory()) continue

    const match = matchSidecarName(entry.name, base, lowerBase)
    if (!match) continue

    const filePath = join(directory, entry.name)

    try {
      const stats = await fs.lstat(filePath)
      if (stats.isSymbolicLink() || !stats.isFile()) continue
      if (stats.size > MAX_SIDECAR_BYTES) {
        console.debug(`[lyrics] Skipping oversized sidecar: ${entry.name}`)
        continue
      }

      const buffer = await fs.readFile(filePath)
      sidecars.push({ fileName: entry.name, text: decodeSidecar(buffer), ...match })
    } catch (error) {
      console.warn(`[lyrics] Skipping unreadable sidecar: ${entry.name}`, error)
    }
  }

  sidecars.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1
    return a.fileName.localeCompare(b.fileName)
  })

  return sidecars
}

function matchSidecarName(
  fileName: string,
  base: string,
  lowerBase: string
): { exact: boolean; variant: string | null } | null {
  const normalized = normalizeName(fileName)
  const lower = normalized.toLowerCase()
  if (!lower.endsWith('.lrc')) return null

  if (lower === `${lowerBase}.lrc`) return { exact: true, variant: null }
  if (!lower.startsWith(`${lowerBase}.`)) return null

  const variant = normalized.slice(base.length + 1, -4)
  if (variant === '') return null

  return { exact: false, variant }
}

function normalizeName(value: string): string {
  return value.normalize('NFC')
}

function decodeSidecar(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8')
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le')
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2, buffer.length - ((buffer.length - 2) % 2))
    const swapped = Buffer.from(body)
    swapped.swap16()
    return swapped.toString('utf16le')
  }

  return buffer.toString('utf8')
}

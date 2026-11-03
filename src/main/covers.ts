import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import { parseFile } from 'music-metadata'
import { writeFileAtomic } from './json-file'
import { getAlbumTrackPaths } from './library'

const COVER_SIZE = 300
const SMALL_COVER_SIZE = 96
export type CoverSize = 'full' | 'small'
// Embedded art is normally repeated on every track; checking a few keeps art-less albums cheap.
const EMBEDDED_COVER_ATTEMPTS = 3
const FALLBACK_NAMES = new Set(['cover.jpg', 'folder.jpg', 'front.jpg'])

export class CoverService {
  private readonly cacheDir: string
  private readonly inFlight = new Map<string, Promise<string | null>>()

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir
  }

  /** Returns the path of a generated/cached JPEG, or null when the album has no art. */
  async getCover(albumId: string, size: CoverSize = 'full'): Promise<string | null> {
    if (!/^[a-f0-9]{40}$/.test(albumId)) return null

    const fileName = size === 'small' ? `${albumId}-small.jpg` : `${albumId}.jpg`
    const cachedPath = join(this.cacheDir, fileName)
    if (await isFile(cachedPath)) return cachedPath

    const key = `${albumId}:${size}`
    const pending = this.inFlight.get(key)
    if (pending) return pending

    const job = (
      size === 'small'
        ? this.createSmallCover(albumId, cachedPath)
        : this.createCover(albumId, cachedPath)
    ).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, job)
    return job
  }

  private async createCover(albumId: string, targetPath: string): Promise<string | null> {
    const trackPaths = getAlbumTrackPaths(albumId)
    if (trackPaths.length === 0) return null

    const image = (await readEmbeddedCover(trackPaths)) ?? (await readFolderCover(trackPaths))
    if (!image || image.isEmpty()) return null

    return this.writeJpeg(targetPath, image, COVER_SIZE)
  }

  private async createSmallCover(albumId: string, targetPath: string): Promise<string | null> {
    // Reuse the full cover as the source so the small variant is generated only once.
    const fullCoverPath = await this.getCover(albumId)
    if (!fullCoverPath) return null

    const image = nativeImage.createFromPath(fullCoverPath)
    if (image.isEmpty()) return null

    return this.writeJpeg(targetPath, image, SMALL_COVER_SIZE)
  }

  private async writeJpeg(
    targetPath: string,
    image: NativeImage,
    maxWidth: number
  ): Promise<string | null> {
    const resized =
      image.getSize().width > maxWidth ? image.resize({ width: maxWidth, quality: 'good' }) : image
    const jpeg = resized.toJPEG(85)
    if (jpeg.length === 0) return null

    await fs.mkdir(this.cacheDir, { recursive: true })
    await writeFileAtomic(targetPath, jpeg)
    return targetPath
  }
}

async function readEmbeddedCover(trackPaths: string[]): Promise<NativeImage | null> {
  for (const trackPath of trackPaths.slice(0, EMBEDDED_COVER_ATTEMPTS)) {
    try {
      const metadata = await parseFile(trackPath, { duration: false, skipCovers: false })
      const picture = metadata.common.picture?.[0]
      if (!picture) continue

      const image = nativeImage.createFromBuffer(Buffer.from(picture.data))
      if (!image.isEmpty()) return image
    } catch {
      // Unreadable tags: try the next track in the album.
    }
  }

  return null
}

async function readFolderCover(trackPaths: string[]): Promise<NativeImage | null> {
  const folders = [...new Set(trackPaths.map((trackPath) => dirname(trackPath)))]

  for (const folder of folders) {
    let entries: string[]
    try {
      entries = await fs.readdir(folder)
    } catch {
      continue
    }

    const match = entries.find((name) => FALLBACK_NAMES.has(name.toLowerCase()))
    if (!match) continue

    const image = nativeImage.createFromPath(join(folder, match))
    if (!image.isEmpty()) return image
  }

  return null
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile()
  } catch {
    return false
  }
}

import { createReadStream, promises as fs } from 'node:fs'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import type { CoverService } from './covers'
import { getLibraryRoot, isPathInside, resolveTrackFile } from './library'
import { parseByteRange } from './range'

export const MEDIA_SCHEME = 'media'
const TRACK_HOST = 'track'
const COVER_HOST = 'cover'
const ID_PATTERN = /^[a-f0-9]{40}$/

const FLAC_HEADERS = {
  'Content-Type': 'audio/flac',
  'Accept-Ranges': 'bytes',
  'Cache-Control': 'no-store'
} as const

/** Must run before app.whenReady(); `stream: true` is required for media seeking. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

export function handleMediaProtocol(covers: CoverService): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    const id = url.pathname.slice(1)

    if (url.host === TRACK_HOST) return serveTrack(id, request)
    if (url.host === COVER_HOST) return serveCover(id, covers)
    return new Response(null, { status: 404 })
  })
}

async function serveTrack(trackId: string, request: Request): Promise<Response> {
  if (!ID_PATTERN.test(trackId)) return new Response(null, { status: 404 })

  const indexedPath = resolveTrackFile(trackId)
  const root = getLibraryRoot()
  if (!indexedPath || !root) return new Response(null, { status: 404 })

  let filePath: string
  let size: number
  try {
    // Re-check the canonical path so a replaced symlink cannot escape the selected folder.
    filePath = await fs.realpath(indexedPath)
    const realRoot = await fs.realpath(root)
    if (!isPathInside(realRoot, filePath)) return new Response(null, { status: 404 })

    const stats = await fs.stat(filePath)
    if (!stats.isFile() || !filePath.toLowerCase().endsWith('.flac')) {
      return new Response(null, { status: 404 })
    }
    size = stats.size
  } catch {
    return new Response(null, { status: 404 })
  }

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: { ...FLAC_HEADERS, 'Content-Length': String(size) }
    })
  }

  if (size === 0) {
    return new Response(null, {
      status: 200,
      headers: { ...FLAC_HEADERS, 'Content-Length': '0' }
    })
  }

  const rangeHeader = request.headers.get('range')
  if (!rangeHeader) {
    return streamFile(filePath, 0, size - 1, size, 200, request)
  }

  const range = parseByteRange(rangeHeader, size)
  if (range === 'invalid') {
    // Malformed Range headers are ignored per HTTP semantics: send the whole file.
    return streamFile(filePath, 0, size - 1, size, 200, request)
  }
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' }
    })
  }

  return streamFile(filePath, range.start, range.end, size, 206, request)
}

async function serveCover(albumId: string, covers: CoverService): Promise<Response> {
  if (!ID_PATTERN.test(albumId)) return new Response(null, { status: 404 })

  let coverPath: string | null
  try {
    coverPath = await covers.getCover(albumId)
  } catch (error) {
    console.error(`[covers] Could not prepare cover ${albumId}`, error)
    return new Response(null, { status: 404 })
  }
  if (!coverPath) return new Response(null, { status: 404 })

  try {
    const data = await fs.readFile(coverPath)
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

function streamFile(
  filePath: string,
  start: number,
  end: number,
  size: number,
  status: 200 | 206,
  request: Request
): Response {
  const nodeStream = createReadStream(filePath, { start, end })

  const abort = (): void => {
    nodeStream.destroy()
  }
  if (request.signal.aborted) {
    nodeStream.destroy()
  } else {
    request.signal.addEventListener('abort', abort, { once: true })
    nodeStream.on('close', () => request.signal.removeEventListener('abort', abort))
  }

  const headers: Record<string, string> = {
    ...FLAC_HEADERS,
    'Content-Length': String(end - start + 1)
  }
  if (status === 206) {
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  }

  const body = Readable.toWeb(nodeStream) as unknown as ConstructorParameters<typeof Response>[0]
  return new Response(body, { status, headers })
}

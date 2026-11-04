import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyLibraryCache,
  LIBRARY_CACHE_VERSION,
  loadLibraryCache,
  saveLibraryCache
} from '../src/main/cache'
import type { CachedTrack, LibraryCache } from '../src/shared/types'

let directory = ''

function cachePath(): string {
  return join(directory, 'library-cache.json')
}

function cachedTrack(overrides: Partial<CachedTrack> = {}): CachedTrack {
  return {
    mtimeMs: 1_700_000_000_000,
    size: 12_345,
    title: 'Title',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Album Artist',
    trackNumber: 1,
    discNumber: 1,
    year: 2020,
    duration: 180,
    ...overrides
  }
}

async function writeJson(value: unknown): Promise<void> {
  await writeFile(cachePath(), JSON.stringify(value), 'utf8')
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lyrix-cache-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('emptyLibraryCache', () => {
  it('returns the current schema version with no folder or tracks', () => {
    expect(emptyLibraryCache()).toEqual({
      version: LIBRARY_CACHE_VERSION,
      folder: null,
      tracks: {}
    })
  })
})

describe('loadLibraryCache', () => {
  it('returns an empty cache when the file is missing', async () => {
    expect(await loadLibraryCache(cachePath())).toEqual(emptyLibraryCache())
  })

  it('returns an empty cache for malformed JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await writeFile(cachePath(), '{not json', 'utf8')

    expect(await loadLibraryCache(cachePath())).toEqual(emptyLibraryCache())
    expect(warn).toHaveBeenCalled()
  })

  it('rejects an unsupported schema version', async () => {
    await writeJson({ version: LIBRARY_CACHE_VERSION + 1, folder: null, tracks: {} })

    expect(await loadLibraryCache(cachePath())).toEqual(emptyLibraryCache())
  })

  it('rejects a folder that is neither null nor a string', async () => {
    await writeJson({ version: LIBRARY_CACHE_VERSION, folder: 42, tracks: {} })

    expect(await loadLibraryCache(cachePath())).toEqual(emptyLibraryCache())
  })

  it.each([
    { label: 'an array', tracks: [] },
    { label: 'null', tracks: null },
    { label: 'a string', tracks: 'tracks' },
    { label: 'a number', tracks: 42 }
  ])('rejects $label as the tracks container', async ({ tracks }) => {
    await writeJson({ version: LIBRARY_CACHE_VERSION, folder: null, tracks })

    expect(await loadLibraryCache(cachePath())).toEqual(emptyLibraryCache())
  })

  it('keeps valid entries and drops malformed ones individually', async () => {
    const valid = cachedTrack()
    const withNulls = cachedTrack({ trackNumber: null, discNumber: null, year: null })

    await writeJson({
      version: LIBRARY_CACHE_VERSION,
      folder: 'C:/music',
      tracks: {
        'good.flac': valid,
        'good-nulls.flac': withNulls,
        'bad-title.flac': { ...valid, title: undefined },
        'bad-mtime.flac': { ...valid, mtimeMs: '1' },
        'bad-duration.flac': { ...valid, duration: null },
        'bad-year.flac': { ...valid, year: '2000' }
      }
    })

    const cache = await loadLibraryCache(cachePath())

    expect(cache.version).toBe(LIBRARY_CACHE_VERSION)
    expect(cache.folder).toBe('C:/music')
    expect(Object.keys(cache.tracks)).toEqual(['good.flac', 'good-nulls.flac'])
    expect(cache.tracks['good.flac']).toEqual(valid)
    expect(cache.tracks['good-nulls.flac']).toEqual(withNulls)
  })

  it('accepts a null folder', async () => {
    await writeJson({
      version: LIBRARY_CACHE_VERSION,
      folder: null,
      tracks: { 'good.flac': cachedTrack() }
    })

    expect((await loadLibraryCache(cachePath())).folder).toBeNull()
  })
})

describe('saveLibraryCache', () => {
  it('round-trips a cache through disk', async () => {
    const cache: LibraryCache = {
      version: LIBRARY_CACHE_VERSION,
      folder: 'C:/music',
      tracks: { 'good.flac': cachedTrack() }
    }

    await saveLibraryCache(cachePath(), cache)

    expect(await loadLibraryCache(cachePath())).toEqual(cache)
  })

  it('writes readable JSON', async () => {
    const cache: LibraryCache = {
      version: LIBRARY_CACHE_VERSION,
      folder: null,
      tracks: {}
    }

    await saveLibraryCache(cachePath(), cache)

    const raw = await readFile(cachePath(), 'utf8')
    expect(JSON.parse(raw)).toEqual(cache)
  })
})

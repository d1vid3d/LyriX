import { promises as fs } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Album, Track } from '../src/shared/types'
import { FavoritesStore } from '../src/main/lyrixdata/favoritesStore'
import { nodeFsAdapter } from '../src/main/lyrixdata/fsAdapter'
import { LyrixDataStore } from '../src/main/lyrixdata/lyrixDataStore'

function track(id: string, title = 'Song'): Track {
  return {
    id,
    title,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNumber: 1,
    discNumber: null,
    year: null,
    duration: 10,
    url: `media://track/${id}`
  }
}

const trackA = track('a'.repeat(40), 'Alpha')
const trackB = track('b'.repeat(40), 'Beta')

let roots: string[] = []

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lyrix-favorites-'))
  roots.push(root)
  const album: Album = {
    id: 'album-1',
    title: 'Album',
    artist: 'Artist',
    year: null,
    coverUrl: 'media://cover/album-1',
    tracks: [trackA, trackB]
  }
  const paths = new Map([
    [trackA.id, join(root, 'Album', 'Alpha.flac')],
    [trackB.id, join(root, 'Album', 'Beta.flac')]
  ])

  const lyrixData = new LyrixDataStore({
    fs: nodeFsAdapter,
    machineId: '11111111-1111-4111-8111-111111111111',
    appVersion: '0.1.0',
    onStatusChange: () => undefined
  })
  await lyrixData.bind(root)

  const states: Array<{ items: unknown[]; missing: unknown[] }> = []
  const favorites = new FavoritesStore({
    store: lyrixData,
    resolveTrackFile: (id) => paths.get(id) ?? null,
    onStateChange: (state) => states.push(state)
  })
  await favorites.setLibrary(root, [album])

  return { root, album, paths, lyrixData, favorites, states }
}

async function writeFavoritesFile(
  root: string,
  items: unknown[]
): Promise<void> {
  const dir = join(root, 'LyrixData')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    join(dir, 'favorites.json'),
    JSON.stringify({
      version: 1,
      items,
      writtenBy: {
        app: 'LyriX',
        appVersion: '0.1.0',
        machineId: '11111111-1111-4111-8111-111111111111',
        at: 1
      }
    })
  )
}

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
  roots = []
})

describe('FavoritesStore', () => {
  it('adds and removes idempotently and reports missing refs', async () => {
    const { root, favorites } = await setup()

    const added = await favorites.add([trackA.id])
    expect(added.ok).toBe(true)
    expect(favorites.getState().items).toEqual([
      { trackId: trackA.id, addedAt: expect.any(Number) }
    ])

    await favorites.add([trackA.id])
    expect(favorites.getState().items).toHaveLength(1)

    await favorites.remove([trackA.id])
    expect(favorites.getState().items).toEqual([])

    const saved = JSON.parse(
      await fs.readFile(join(root, 'LyrixData', 'favorites.json'), 'utf8')
    )
    expect(saved.items).toEqual([])
  })

  it('re-reads the file so external changes are not clobbered', async () => {
    const { root, favorites } = await setup()
    await favorites.add([trackA.id])

    const refB = {
      path: 'Album/Beta.flac',
      fp: { title: 'Beta', artist: 'Artist', album: 'Album', durationSec: 10 },
      note: 'keep me'
    }
    const current = JSON.parse(
      await fs.readFile(join(root, 'LyrixData', 'favorites.json'), 'utf8')
    )
    await writeFavoritesFile(root, [...current.items, { ref: refB, addedAt: 5 }])

    await favorites.add([trackB.id])
    const saved = JSON.parse(
      await fs.readFile(join(root, 'LyrixData', 'favorites.json'), 'utf8')
    )
    expect(saved.items.map((item: { ref: { path: string } }) => item.ref.path)).toEqual([
      'Album/Alpha.flac',
      'Album/Beta.flac'
    ])
    expect(saved.items[1].ref.note).toBe('keep me')
  })

  it('serializes concurrent mutations without losing either change', async () => {
    const { root, favorites } = await setup()
    const [a, b] = await Promise.all([
      favorites.add([trackA.id]),
      favorites.add([trackB.id])
    ])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)

    const saved = JSON.parse(
      await fs.readFile(join(root, 'LyrixData', 'favorites.json'), 'utf8')
    )
    expect(saved.items.map((item: { ref: { path: string } }) => item.ref.path).sort()).toEqual([
      'Album/Alpha.flac',
      'Album/Beta.flac'
    ])
  })

  it('heals a relinked ref only during a real write', async () => {
    const { root, favorites } = await setup()
    await writeFavoritesFile(root, [
      {
        ref: {
          path: 'Old/Alpha.flac',
          fp: { title: 'Alpha', artist: 'Artist', album: 'Album', durationSec: 10 }
        },
        addedAt: 1
      }
    ])
    await favorites.setLibrary(root, [
      {
        id: 'album-1',
        title: 'Album',
        artist: 'Artist',
        year: null,
        coverUrl: 'media://cover/album-1',
        tracks: [trackA, trackB]
      }
    ])
    expect(favorites.getState().items[0]?.trackId).toBe(trackA.id)

    const before = JSON.parse(
      await fs.readFile(join(root, 'LyrixData', 'favorites.json'), 'utf8')
    )
    expect(before.items[0].ref.path).toBe('Old/Alpha.flac')

    await favorites.add([trackB.id])
    const after = JSON.parse(
      await fs.readFile(join(root, 'LyrixData', 'favorites.json'), 'utf8')
    )
    expect(after.items.map((item: { ref: { path: string } }) => item.ref.path)).toEqual([
      'Album/Alpha.flac',
      'Album/Beta.flac'
    ])
  })

  it('re-resolves on snapshot changes and removes all missing entries', async () => {
    const { root, album, favorites } = await setup()
    await favorites.add([trackA.id, trackB.id])
    expect(favorites.getState().items).toHaveLength(2)

    const onlyB: Album = { ...album, tracks: [trackB] }
    await favorites.setLibrary(root, [onlyB])
    expect(favorites.getState().items.map((item) => item.trackId)).toEqual([trackB.id])
    expect(favorites.getState().missing).toHaveLength(1)

    await favorites.removeAllMissing()
    expect(favorites.getState().missing).toHaveLength(0)
    const saved = JSON.parse(
      await fs.readFile(join(root, 'LyrixData', 'favorites.json'), 'utf8')
    )
    expect(saved.items).toHaveLength(1)
  })
})

import { promises as fs } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Album, LyrixDataStatus, Track } from '../src/shared/types'
import { nodeFsAdapter } from '../src/main/lyrixdata/fsAdapter'
import { HistoryStore } from '../src/main/lyrixdata/historyStore'
import { HISTORY_READ_BYTES } from '../src/main/lyrixdata/historyLog'
import { LyrixDataStore } from '../src/main/lyrixdata/lyrixDataStore'

function track(id: string, title: string): Track {
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
  const root = await mkdtemp(join(tmpdir(), 'lyrix-history-'))
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
  const clock = { value: 1_000 }

  const lyrixData = new LyrixDataStore({
    fs: nodeFsAdapter,
    machineId: '11111111-1111-4111-8111-111111111111',
    appVersion: '0.1.0',
    onStatusChange: () => undefined
  })
  await lyrixData.bind(root)

  const history = new HistoryStore({
    store: lyrixData,
    resolveTrackFile: (id) => paths.get(id) ?? null,
    onStateChange: () => undefined,
    now: () => clock.value
  })
  await history.setLibrary(root, [album])

  return { root, album, lyrixData, history, clock }
}

async function readHistoryLines(root: string): Promise<string[]> {
  try {
    const text = await fs.readFile(join(root, 'LyrixData', 'history.jsonl'), 'utf8')
    return text.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
  roots = []
})

describe('HistoryStore', () => {
  it('creates and writes nothing while recording is off', async () => {
    const { root, history } = await setup()
    expect(await history.record(trackA.id)).toEqual({ ok: true })
    expect(await fs.stat(join(root, 'LyrixData')).catch(() => null)).toBeNull()

    const state = await history.read()
    expect(state.recent).toEqual([])
    expect(state.recording.status).toBe('not-created')
  })

  it('setRecording(true) creates LyrixData and the library flag', async () => {
    const { root, history } = await setup()
    const result = await history.setRecording(true)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state.recording.status).toBe('recording')

    const library = JSON.parse(await fs.readFile(join(root, 'LyrixData', 'library.json'), 'utf8'))
    expect(library.historyRecording).toBe(true)
    expect(await fs.stat(join(root, 'LyrixData', 'README.txt'))).toBeTruthy()
  })

  it('appends one line per counted play and applies the 5 s guard', async () => {
    const { root, history, clock } = await setup()
    await history.setRecording(true)

    clock.value = 10_000
    await history.record(trackA.id)
    clock.value = 12_000
    await history.record(trackA.id)
    clock.value = 15_000
    await history.record(trackA.id)
    clock.value = 20_000
    await history.record(trackA.id)

    const lines = await readHistoryLines(root)
    expect(lines).toHaveLength(3)
    const records = lines.map((line) => JSON.parse(line))
    expect(records[0].at).toBe(10_000)
    expect(records[0].m).toBe('11111111-1111-4111-8111-111111111111')
    expect(records[0].ref.path).toBe('Album/Alpha.flac')

    const state = await history.read()
    expect(state.recent).toEqual([{ trackId: trackA.id, lastPlayedAt: 20_000, playCount: 3 }])
  })

  it('stops appending after recording is turned off', async () => {
    const { root, history, clock } = await setup()
    await history.setRecording(true)
    clock.value = 10_000
    await history.record(trackA.id)

    await history.setRecording(false)
    clock.value = 30_000
    await history.record(trackB.id)
    expect(await readHistoryLines(root)).toHaveLength(1)
    expect((await history.read()).recording.status).toBe('off')
  })

  it('clear empties history but leaves library.json untouched', async () => {
    const { root, history, clock } = await setup()
    await history.setRecording(true)
    clock.value = 10_000
    await history.record(trackA.id)
    const libraryBefore = await fs.readFile(join(root, 'LyrixData', 'library.json'), 'utf8')

    const cleared = await history.clear()
    expect(cleared.ok).toBe(true)
    expect(await readHistoryLines(root)).toEqual([])
    expect(await fs.readFile(join(root, 'LyrixData', 'library.json'), 'utf8')).toBe(libraryBefore)
    expect((await history.read()).recent).toEqual([])
  })

  it('preserves unknown library.json fields when toggling the flag', async () => {
    const { root, history } = await setup()
    await history.setRecording(true)
    const path = join(root, 'LyrixData', 'library.json')
    const current = JSON.parse(await fs.readFile(path, 'utf8'))
    await fs.writeFile(path, JSON.stringify({ ...current, futureField: 'keep me' }))

    await history.setRecording(false)
    const saved = JSON.parse(await fs.readFile(path, 'utf8'))
    expect(saved.futureField).toBe('keep me')
    expect(saved.historyRecording).toBe(false)
  })

  it('reports a failed append as blocked without buffering it', async () => {
    let status: LyrixDataStatus = {
      state: 'ready',
      writable: true,
      libraryId: 'id',
      message: null
    }
    let readTailBytes = 0
    const fakeStore = {
      getStatus: () => status,
      getHistoryRecording: async () => ({ enabled: true, newerVersion: false }),
      readTail: async (_file: string, maxBytes: number) => {
        readTailBytes = maxBytes
        return ''
      },
      appendLine: async () => {
        status = { state: 'read-only', writable: false, libraryId: 'id', message: null }
        return { ok: false, reason: 'read-only' }
      },
      getMachineId: () => 'machine',
      setHistoryRecording: async () => ({ ok: true }),
      clearLineFile: async () => ({ ok: true })
    }
    const history = new HistoryStore({
      store: fakeStore as unknown as LyrixDataStore,
      resolveTrackFile: () => join('root', 'Song.flac'),
      onStateChange: () => undefined,
      now: () => 1000
    })
    await history.setLibrary('root', [
      {
        id: 'album-1',
        title: 'Album',
        artist: 'Artist',
        year: null,
        coverUrl: 'media://cover/album-1',
        tracks: [trackA]
      }
    ])

    expect(await history.record(trackA.id)).toEqual({ ok: false })
    const state = await history.read()
    expect(state.recording).toEqual({
      enabled: true,
      status: 'blocked',
      reason: 'read-only'
    })
    expect(readTailBytes).toBe(HISTORY_READ_BYTES)
  })
})

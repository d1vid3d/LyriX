import { promises as fs } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionStore } from '../src/main/sessionStore'
import { readJsonFile } from '../src/main/json-file'

const trackA = 'a'.repeat(40)
const trackB = 'b'.repeat(40)

const queueState = {
  version: 1,
  entries: [
    { entryId: 'entry-1', trackId: trackA, origin: 'context' },
    { entryId: 'entry-2', trackId: trackB, origin: 'added' }
  ],
  originalOrder: ['entry-1', 'entry-2'],
  currentEntryId: 'entry-1',
  context: { kind: 'album', label: 'Album' }
}

const positionState = { entryId: 'entry-1', trackId: trackA, position: 42 }

let roots: string[] = []

async function makeFiles(folder: string | null) {
  const root = await mkdtemp(join(tmpdir(), 'lyrix-session-'))
  roots.push(root)
  const queueFile = join(root, 'session-queue.json')
  const positionFile = join(root, 'session-position.json')
  await fs.writeFile(
    queueFile,
    JSON.stringify({ version: 1, folder, queue: queueState })
  )
  await fs.writeFile(
    positionFile,
    JSON.stringify({ version: 1, folder, position: positionState })
  )
  return { root, queueFile, positionFile }
}

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
  roots = []
})

describe('SessionStore', () => {
  it('loads a matching session with its position', async () => {
    const { queueFile, positionFile } = await makeFiles('/music/a')
    const store = new SessionStore(queueFile, positionFile, () => '/music/a')

    const session = await store.load()
    expect(session?.queue.entries).toHaveLength(2)
    expect(session?.position?.position).toBe(42)
    expect(store.getSession()).toEqual(session)
  })

  it('discards the session when the library folder differs', async () => {
    const { queueFile, positionFile } = await makeFiles('/music/a')
    const store = new SessionStore(queueFile, positionFile, () => '/music/b')
    expect(await store.load()).toBeNull()
  })

  it('treats corrupt or wrong-version files as no session', async () => {
    const { queueFile, positionFile } = await makeFiles('/music/a')
    await fs.writeFile(queueFile, 'not json')
    expect(await new SessionStore(queueFile, positionFile, () => '/music/a').load()).toBeNull()

    await fs.writeFile(queueFile, JSON.stringify({ version: 9, folder: '/music/a', queue: queueState }))
    expect(await new SessionStore(queueFile, positionFile, () => '/music/a').load()).toBeNull()
  })

  it('keeps the queue payload stable when only the position changes', async () => {
    const { queueFile, positionFile } = await makeFiles('/music/a')
    const store = new SessionStore(queueFile, positionFile, () => '/music/a')
    await store.load()

    store.updatePosition({ entryId: 'entry-1', trackId: trackA, position: 55 })
    await store.flush()

    const savedQueue = await readJsonFile<{ queue: unknown }>(queueFile, { queue: null })
    expect(savedQueue.queue).toEqual(queueState)
    const saved = await readJsonFile<{ position: { position: number } }>(positionFile, {
      position: { position: 0 }
    })
    expect(saved.position.position).toBe(55)
  })

  it('ignores a position for a different entry or track', async () => {
    const { queueFile, positionFile } = await makeFiles('/music/a')
    const store = new SessionStore(queueFile, positionFile, () => '/music/a')
    await store.load()

    store.updatePosition({ entryId: 'entry-2', trackId: trackA, position: 10 })
    store.updatePosition({ entryId: 'entry-1', trackId: trackB, position: 10 })
    await store.flush()

    const saved = await readJsonFile<{ position: { position: number } }>(positionFile, {
      position: { position: 0 }
    })
    expect(saved.position.position).toBe(42)
  })

  it('validates queue updates and writes them to the queue file only', async () => {
    const { queueFile, positionFile } = await makeFiles('/music/a')
    const store = new SessionStore(queueFile, positionFile, () => '/music/a')
    await store.load()

    store.updateQueue({ version: 1, entries: 'bad' })
    expect(store.getSession()?.queue.entries).toHaveLength(2)

    store.updateQueue({
      version: 1,
      entries: [{ entryId: 'entry-9', trackId: trackB, origin: 'context' }],
      originalOrder: ['entry-9'],
      currentEntryId: 'entry-9',
      context: null
    })
    await store.flush()

    const saved = await readJsonFile<{ queue: { entries: unknown[] } }>(queueFile, {
      queue: { entries: [] }
    })
    expect(saved.queue.entries).toHaveLength(1)
  })
})

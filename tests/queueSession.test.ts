import { describe, expect, it } from 'vitest'
import type { Track } from '../src/shared/types'
import type { SessionQueueState } from '../src/shared/types'
import { PlaybackQueue } from '../src/renderer/player/queue'

function track(id: string): Track {
  return {
    id,
    title: `Title ${id}`,
    artist: `Artist ${id}`,
    album: 'Album',
    albumArtist: 'Album Artist',
    trackNumber: null,
    discNumber: null,
    year: null,
    duration: 10,
    url: `media://track/${id}`
  }
}

const tracks = ['a', 'b', 'c', 'd'].map(track)
const byId = new Map(tracks.map((value) => [value.id, value]))

function lookup(id: string): Track | null {
  return byId.get(id) ?? null
}

function queueIds(queue: PlaybackQueue): string[] {
  return queue.getSnapshot().entries.map((entry) => entry.track.id)
}

function restore(state: SessionQueueState, lookupFn = lookup): PlaybackQueue {
  const queue = new PlaybackQueue()
  queue.importState(state, lookupFn)
  return queue
}

describe('PlaybackQueue exportState/importState', () => {
  it('round-trips the play order, current entry, context, and natural order', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 1, { context: { kind: 'album', label: 'Album' } })
    const state = queue.exportState()

    expect(state.version).toBe(1)
    expect(state.currentEntryId).toBe(queue.getSnapshot().current?.entryId)
    expect(state.entries.map((entry) => entry.trackId)).toEqual(['a', 'b', 'c', 'd'])

    const restored = restore(state)
    const snapshot = restored.getSnapshot()
    expect(snapshot.entries.map((entry) => entry.track.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(snapshot.current?.track.id).toBe('b')
    expect(snapshot.context).toEqual({ kind: 'album', label: 'Album' })

    restored.setShuffle(false)
    expect(queueIds(restored)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('preserves a shuffled order and the original order across a restart', () => {
    const queue = new PlaybackQueue(() => 0.37)
    queue.setQueue(tracks, 0)
    queue.setShuffle(true)
    queue.addToQueue([track('e')])
    queue.playNext([track('x')])

    const state = queue.exportState()
    const exactOrder = state.entries.map((entry) => entry.trackId)
    const naturalOrder = [...state.originalOrder]
    const naturalOrderTracks = naturalOrder.map(
      (entryId) => state.entries.find((entry) => entry.entryId === entryId)?.trackId ?? ''
    )
    const fullLookup = new Map([
      ...tracks.map((value) => [value.id, value] as const),
      ['e', track('e')] as const,
      ['x', track('x')] as const
    ])

    const restored = restore(state, (id) => fullLookup.get(id) ?? null)
    expect(queueIds(restored)).toEqual(exactOrder)
    expect(restored.getSnapshot().current?.track.id).toBe('a')

    restored.setShuffle(true)
    restored.setShuffle(false)
    expect(queueIds(restored)).toEqual(naturalOrderTracks)
    expect(queueIds(restored)).toEqual(['a', 'x', 'b', 'c', 'd', 'e'])
  })

  it('does not reshuffle while importing', () => {
    const queue = new PlaybackQueue(() => 0.9)
    queue.setQueue(tracks, 0)
    queue.setShuffle(true)
    const state = queue.exportState()

    const restored = restore(state)
    expect(queueIds(restored)).toEqual(state.entries.map((entry) => entry.trackId))
    expect(restored.getSnapshot().shuffle).toBe(false)
  })

  it('drops vanished tracks from the order and natural order', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 0)
    const state = queue.exportState()

    const restored = restore(state, (id) => (id === 'b' ? null : lookup(id)))
    expect(queueIds(restored)).toEqual(['a', 'c', 'd'])
    expect(restored.exportState().originalOrder).toEqual(
      restored.getSnapshot().entries.map((entry) => entry.entryId)
    )
  })

  it('restarts at the first survivor when the current entry vanished', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 2)
    const state = queue.exportState()

    const restored = restore(state, (id) => (id === 'c' ? null : lookup(id)))
    expect(restored.getSnapshot().current?.track.id).toBe('a')
    expect(restored.getSnapshot().currentIndex).toBe(0)
  })

  it('becomes an empty queue when every track vanished', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 1, { context: { kind: 'artist', label: 'Artist' } })

    const restored = restore(queue.exportState(), () => null)
    const snapshot = restored.getSnapshot()
    expect(snapshot.entries).toEqual([])
    expect(snapshot.current).toBeNull()
    expect(snapshot.context).toBeNull()
  })

  it('treats malformed input as an empty queue without throwing', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 0)

    for (const value of [null, 'nope', 42, { version: 2, entries: [] }, { version: 1 }]) {
      expect(queue.importState(value, lookup)).toBeNull()
      expect(queue.getSnapshot().entries).toEqual([])
      expect(queue.getSnapshot().context).toBeNull()
    }
  })

  it('ignores duplicate entry ids and repairs a missing natural order', () => {
    const state: SessionQueueState = {
      version: 1,
      entries: [
        { entryId: 'entry-9', trackId: 'a', origin: 'context' },
        { entryId: 'entry-9', trackId: 'b', origin: 'context' },
        { entryId: 'entry-2', trackId: 'c', origin: 'added' }
      ],
      originalOrder: ['entry-9'],
      currentEntryId: 'entry-2',
      context: null
    }

    const restored = restore(state)
    expect(queueIds(restored)).toEqual(['a', 'c'])
    expect(restored.exportState().originalOrder).toEqual(['entry-9', 'entry-2'])
    expect(restored.getSnapshot().current?.track.id).toBe('c')
  })
})

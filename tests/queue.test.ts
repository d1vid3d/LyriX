import { describe, expect, it } from 'vitest'
import { PlaybackQueue } from '../src/renderer/player/queue'
import type { QueueEntry, RepeatMode } from '../src/renderer/player/queue'
import type { Track } from '../src/shared/types'

function track(id: string): Track {
  return {
    id,
    title: `Title ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNumber: null,
    discNumber: null,
    year: null,
    duration: 0,
    url: `media://track/${id}`
  }
}

const tracks = [track('a'), track('b'), track('c')]

function snapshot(queue: PlaybackQueue) {
  return queue.getSnapshot()
}

function ids(queue: PlaybackQueue): string[] {
  return snapshot(queue).entries.map((entry) => entry.track.id)
}

function entry(queue: PlaybackQueue, index: number): QueueEntry {
  return snapshot(queue).entries[index]
}

function currentId(queue: PlaybackQueue): string | null {
  return snapshot(queue).current?.track.id ?? null
}

describe('PlaybackQueue', () => {
  it('starts empty', () => {
    const queue = new PlaybackQueue()

    expect(queue.getSnapshot()).toMatchObject({
      entries: [],
      currentIndex: -1,
      current: null,
      shuffle: false,
      repeat: 'off',
      context: null,
      version: 0
    })
    expect(queue.canGoNext()).toBe(false)
    expect(queue.canGoPrevious()).toBe(false)
    expect(queue.advance('ended')).toBeNull()
    expect(queue.advance('skip')).toBeNull()
    expect(queue.peekNext('ended')).toBeNull()
    expect(queue.previous()).toBeNull()
  })

  it('sets the queue and returns the requested current entry', () => {
    const queue = new PlaybackQueue()
    const context = { kind: 'album' as const, label: 'Record' }

    expect(queue.setQueue(tracks, 1, { context })?.track.id).toBe('b')
    expect(currentId(queue)).toBe('b')
    expect(snapshot(queue).currentIndex).toBe(1)
    expect(ids(queue)).toEqual(['a', 'b', 'c'])
    expect(snapshot(queue).context).toEqual(context)
    expect(snapshot(queue).entries.map((entry) => entry.origin)).toEqual([
      'context',
      'context',
      'context'
    ])
  })

  it.each([
    [-5, 'a'],
    [0, 'a'],
    [2, 'c'],
    [99, 'c'],
    [1.9, 'b'],
    [Number.NaN, 'a'],
    [Number.POSITIVE_INFINITY, 'a'],
    [Number.NEGATIVE_INFINITY, 'a']
  ] as Array<[number, string]>)('clamps start index %s to track %s', (startIndex, expected) => {
    const queue = new PlaybackQueue()

    expect(queue.setQueue(tracks, startIndex)?.track.id).toBe(expected)
    expect(currentId(queue)).toBe(expected)
  })

  it('uses unique entry ids when the same track appears more than once', () => {
    const queue = new PlaybackQueue()
    queue.setQueue([track('a'), track('a'), track('b')])

    const entryIds = snapshot(queue).entries.map((entry) => entry.entryId)
    expect(new Set(entryIds).size).toBe(3)
  })

  it('clears the queue when setQueue receives an empty list', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 1)

    expect(queue.setQueue([])).toBeNull()
    expect(currentId(queue)).toBeNull()
    expect(snapshot(queue).currentIndex).toBe(-1)
    expect(ids(queue)).toEqual([])
    expect(queue.canGoNext()).toBe(false)
    expect(queue.canGoPrevious()).toBe(false)
  })

  it('resets the index when a new queue is set', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 2)

    expect(queue.setQueue([track('z')], 9)?.track.id).toBe('z')
    expect(snapshot(queue).currentIndex).toBe(0)
  })

  it('copies the input array instead of keeping the caller reference', () => {
    const source = [track('a'), track('b')]
    const queue = new PlaybackQueue()
    queue.setQueue(source, 1)

    source.push(track('c'))
    source[0] = track('x')

    expect(ids(queue)).toEqual(['a', 'b'])
    expect(currentId(queue)).toBe('b')
  })

  it('returns a frozen snapshot and memoizes it until the next mutation', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 0, { context: { kind: 'tracks', label: 'Tracks' } })

    const first = queue.getSnapshot()
    expect(queue.getSnapshot()).toBe(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.entries)).toBe(true)
    expect(Object.isFrozen(first.entries[0])).toBe(true)
    expect(Object.isFrozen(first.context)).toBe(true)
    expect(() => {
      ;(first.entries as QueueEntry[]).push(entry(queue, 0))
    }).toThrow()

    queue.setRepeat('all')
    const second = queue.getSnapshot()
    expect(second).not.toBe(first)
    expect(second.version).toBe(first.version + 1)
  })

  it('notifies subscribers after mutations and stops after unsubscribe', () => {
    const queue = new PlaybackQueue()
    const versions: number[] = []
    const unsubscribe = queue.subscribe((value) => versions.push(value.version))

    queue.setQueue(tracks)
    queue.advance('skip')
    queue.setShuffle(true)
    queue.setRepeat('all')
    expect(queue.getSnapshot())
    expect(versions).toEqual([1, 2, 3, 4])

    unsubscribe()
    queue.clear()
    expect(versions).toEqual([1, 2, 3, 4])
  })

  it('keeps playNext calls in the order added and ahead of context tracks', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 0)

    queue.playNext([track('x'), track('y')])
    expect(ids(queue)).toEqual(['a', 'x', 'y', 'b', 'c'])

    queue.playNext([track('z')])
    expect(ids(queue)).toEqual(['a', 'x', 'y', 'z', 'b', 'c'])
    expect(snapshot(queue).entries.map((entry) => entry.origin)).toEqual([
      'context',
      'playNext',
      'playNext',
      'playNext',
      'context',
      'context'
    ])
  })

  it('appends addToQueue entries at the end', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 0)

    queue.addToQueue([track('x'), track('y')])

    expect(ids(queue)).toEqual(['a', 'b', 'c', 'x', 'y'])
    expect(snapshot(queue).entries.slice(-2).map((entry) => entry.origin)).toEqual([
      'added',
      'added'
    ])
  })

  it('removes entries, adjusts the current index, and refuses to remove the current entry', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 1)
    const [a, b, c] = snapshot(queue).entries

    expect(queue.remove(b.entryId)).toBe(false)
    expect(queue.remove(a.entryId)).toBe(true)
    expect(ids(queue)).toEqual(['b', 'c'])
    expect(snapshot(queue).currentIndex).toBe(0)
    expect(currentId(queue)).toBe('b')

    expect(queue.remove(c.entryId)).toBe(true)
    expect(ids(queue)).toEqual(['b'])
    expect(currentId(queue)).toBe('b')
    expect(queue.remove('missing')).toBe(false)
  })

  it('moves entries, clamps the target index, and keeps the current entry current', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 1)
    const [a, , c] = snapshot(queue).entries

    expect(queue.move(c.entryId, 0)).toBe(true)
    expect(ids(queue)).toEqual(['c', 'a', 'b'])
    expect(snapshot(queue).currentIndex).toBe(2)
    expect(currentId(queue)).toBe('b')

    expect(queue.move(a.entryId, 99)).toBe(true)
    expect(ids(queue)).toEqual(['c', 'b', 'a'])
    expect(snapshot(queue).currentIndex).toBe(1)
    expect(currentId(queue)).toBe('b')

    expect(queue.move('missing', 0)).toBe(false)
  })

  it('jumps to an entry id', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 0)
    const c = entry(queue, 2)

    expect(queue.jumpTo('missing')).toBeNull()
    expect(queue.jumpTo(c.entryId)?.track.id).toBe('c')
    expect(snapshot(queue).currentIndex).toBe(2)
  })

  it('clears upcoming entries only', () => {
    const queue = new PlaybackQueue()
    queue.setQueue([track('a'), track('b'), track('c'), track('d')], 1)

    expect(queue.clearUpcoming()).toBe(2)
    expect(ids(queue)).toEqual(['a', 'b'])
    expect(queue.clearUpcoming()).toBe(0)
  })

  it('clears the whole queue but keeps shuffle and repeat preferences', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 1)
    queue.setRepeat('all')
    queue.setShuffle(true)

    expect(queue.clear()).toBe(3)
    expect(ids(queue)).toEqual([])
    expect(currentId(queue)).toBeNull()
    expect(snapshot(queue).currentIndex).toBe(-1)
    expect(snapshot(queue).context).toBeNull()
    expect(snapshot(queue).repeat).toBe('all')
    expect(snapshot(queue).shuffle).toBe(true)
  })

  it('starts a shuffled queue with the requested track first', () => {
    const queue = new PlaybackQueue({ random: () => 0 })
    queue.setShuffle(true)

    expect(queue.setQueue(tracks, 1)?.track.id).toBe('b')
    expect(ids(queue)).toEqual(['b', 'c', 'a'])
    expect(snapshot(queue).currentIndex).toBe(0)

    queue.setShuffle(false)
    expect(ids(queue)).toEqual(['a', 'b', 'c'])
    expect(snapshot(queue).currentIndex).toBe(1)
  })

  it('shuffles only upcoming entries and restores them in original order', () => {
    const queue = new PlaybackQueue({ random: () => 0 })
    const five = [track('a'), track('b'), track('c'), track('d'), track('e')]
    queue.setQueue(five, 2)

    queue.setShuffle(true)
    expect(ids(queue)).toEqual(['a', 'b', 'c', 'e', 'd'])
    expect(snapshot(queue).currentIndex).toBe(2)
    expect(currentId(queue)).toBe('c')

    queue.setShuffle(false)
    expect(ids(queue)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(snapshot(queue).currentIndex).toBe(2)
  })

  it('continues with the natural successor after shuffle is turned off', () => {
    const queue = new PlaybackQueue({ random: () => 0.99 })
    const five = [track('a'), track('b'), track('c'), track('d'), track('e')]
    queue.setShuffle(true)
    queue.setQueue(five, 2)

    queue.setShuffle(false)
    expect(ids(queue)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(currentId(queue)).toBe('c')
    expect(snapshot(queue).currentIndex).toBe(2)
    expect(queue.advance('skip')?.track.id).toBe('d')
  })

  it('re-anchors the current track when it was picked while shuffled', () => {
    const queue = new PlaybackQueue({ random: () => 0.99 })
    const five = [track('a'), track('b'), track('c'), track('d'), track('e')]
    queue.setQueue(five, 2)
    queue.setShuffle(true)

    // Picking another track while shuffled resets the queue with that track first.
    queue.setQueue(five, 1)
    queue.setShuffle(false)

    expect(ids(queue)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(currentId(queue)).toBe('b')
    expect(snapshot(queue).currentIndex).toBe(1)
    expect(queue.advance('skip')?.track.id).toBe('c')
  })

  it('restores added entries in their sensible original positions when shuffle turns off', () => {
    const queue = new PlaybackQueue({ random: () => 0 })
    const five = [track('a'), track('b'), track('c'), track('d'), track('e')]
    queue.setQueue(five, 2)
    queue.setShuffle(true)

    queue.addToQueue([track('f')])
    queue.playNext([track('p')])
    expect(ids(queue)).toEqual(['a', 'b', 'c', 'p', 'e', 'd', 'f'])

    queue.setShuffle(false)
    expect(ids(queue)).toEqual(['a', 'b', 'c', 'p', 'd', 'e', 'f'])
    expect(snapshot(queue).currentIndex).toBe(2)
  })

  it('does not preserve manual reordering done while shuffle is on', () => {
    const queue = new PlaybackQueue({ random: () => 0.99 })
    const four = [track('a'), track('b'), track('c'), track('d')]
    queue.setQueue(four, 0)
    queue.setShuffle(true)

    expect(queue.move(entry(queue, 1).entryId, 3)).toBe(true)
    expect(ids(queue)).toEqual(['a', 'c', 'd', 'b'])

    queue.setShuffle(false)
    expect(ids(queue)).toEqual(['a', 'b', 'c', 'd'])
  })

  describe('advance matrix', () => {
    const cases: Array<{
      repeat: RepeatMode
      reason: 'ended' | 'skip'
      start: number
      expected: string | null
      expectedIndex: number
    }> = []

    for (const repeat of ['off', 'all', 'one'] as const) {
      for (const reason of ['ended', 'skip'] as const) {
        for (const start of [0, 1, 2]) {
          const current = tracks[start].id
          let expected: string | null
          let expectedIndex = start

          if (repeat === 'one' && reason === 'ended') {
            expected = current
          } else if (start === 2) {
            expected = repeat === 'all' ? 'a' : null
            if (expected) expectedIndex = 0
          } else {
            expected = tracks[start + 1].id
            expectedIndex = start + 1
          }

          cases.push({ repeat, reason, start, expected, expectedIndex })
        }
      }
    }

    it.each(cases)(
      'repeat $repeat $reason from index $start returns $expected',
      ({ repeat, reason, start, expected, expectedIndex }) => {
        const queue = new PlaybackQueue()
        queue.setQueue(tracks, start)
        queue.setRepeat(repeat)

        expect(queue.advance(reason)?.track.id ?? null).toBe(expected)
        expect(snapshot(queue).currentIndex).toBe(expectedIndex)
      }
    )

    it.each([
      ['off', 'ended', null],
      ['off', 'skip', null],
      ['all', 'ended', 'a'],
      ['all', 'skip', 'a'],
      ['one', 'ended', 'a'],
      ['one', 'skip', null]
    ] as Array<[RepeatMode, 'ended' | 'skip', string | null]>)(
      'single-entry queue with repeat %s and %s returns %s',
      (repeat, reason, expected) => {
        const queue = new PlaybackQueue()
        queue.setQueue([track('a')], 0)
        queue.setRepeat(repeat)

        expect(queue.advance(reason)?.track.id ?? null).toBe(expected)
        expect(currentId(queue)).toBe('a')
        expect(snapshot(queue).currentIndex).toBe(0)
      }
    )
  })

  describe('previous', () => {
    it('moves backward and stops at the start', () => {
      const queue = new PlaybackQueue()
      queue.setQueue(tracks, 2)

      expect(queue.previous()?.track.id).toBe('b')
      expect(queue.previous()?.track.id).toBe('a')
      expect(queue.previous()).toBeNull()
      expect(snapshot(queue).currentIndex).toBe(0)
    })

    it('wraps to the last entry with repeat all', () => {
      const queue = new PlaybackQueue()
      queue.setQueue(tracks, 0)
      queue.setRepeat('all')

      expect(queue.previous()?.track.id).toBe('c')
      expect(snapshot(queue).currentIndex).toBe(2)
    })

    it('behaves like repeat off at the first entry with repeat one', () => {
      const queue = new PlaybackQueue()
      queue.setQueue(tracks, 0)
      queue.setRepeat('one')

      expect(queue.previous()).toBeNull()
      expect(currentId(queue)).toBe('a')
    })
  })

  describe('button availability', () => {
    it.each([
      ['off', 0, true],
      ['off', 1, true],
      ['off', 2, false],
      ['one', 2, false],
      ['all', 2, true]
    ] as Array<[RepeatMode, number, boolean]>)(
      'repeat %s at index %s enables next: %s',
      (repeat, start, expected) => {
        const queue = new PlaybackQueue()
        queue.setQueue(tracks, start)
        queue.setRepeat(repeat)

        expect(queue.canGoNext()).toBe(expected)
        expect(queue.canGoPrevious()).toBe(true)
      }
    )
  })

  it('peeks the next entry without mutating snapshot state', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 0)
    const before = queue.getSnapshot()

    const peeked = queue.peekNext('skip')
    expect(peeked?.track.id).toBe('b')
    expect(queue.getSnapshot()).toBe(before)

    const advanced = queue.advance('skip')
    expect(advanced?.entryId).toBe(peeked?.entryId)
    expect(queue.getSnapshot().version).toBe(before.version + 1)
  })

  it('peeks a repeat-one replay and repeat-all wrap', () => {
    const repeatOne = new PlaybackQueue()
    repeatOne.setQueue(tracks, 1)
    repeatOne.setRepeat('one')
    const beforeOne = repeatOne.getSnapshot()
    expect(repeatOne.peekNext('ended')?.entryId).toBe(beforeOne.current?.entryId)
    expect(repeatOne.advance('ended')?.entryId).toBe(beforeOne.current?.entryId)
    expect(repeatOne.getSnapshot().version).toBe(beforeOne.version)

    const repeatAll = new PlaybackQueue({ random: () => 0 })
    repeatAll.setQueue(tracks, 2)
    repeatAll.setRepeat('all')
    repeatAll.setShuffle(true)
    const beforeAll = repeatAll.getSnapshot()
    const peeked = repeatAll.peekNext('ended')
    expect(peeked?.track.id).not.toBe('c')
    expect(repeatAll.getSnapshot()).toBe(beforeAll)

    const advanced = repeatAll.advance('ended')
    expect(advanced?.entryId).toBe(peeked?.entryId)
    expect(repeatAll.getSnapshot().version).toBe(beforeAll.version + 1)
  })

  it('reshuffles on repeat-all wrap without immediately replaying the same track', () => {
    const queue = new PlaybackQueue({ random: () => 0 })
    queue.setQueue(tracks, 2)
    queue.setRepeat('all')
    queue.setShuffle(true)

    const next = queue.advance('ended')
    expect(next?.track.id).not.toBe('c')
    expect(ids(queue)).toHaveLength(3)
    expect(snapshot(queue).currentIndex).toBe(0)
  })

  it('reconciles tracks by id, preserves entry ids, and keeps the context', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 1, { context: { kind: 'album', label: 'Record' } })
    const originalEntryIds = snapshot(queue).entries.map((entry) => entry.entryId)

    const result = queue.reconcile((id) => ({ ...track(id), title: `Refreshed ${id}` }))

    expect(result?.track.title).toBe('Refreshed b')
    expect(snapshot(queue).entries.map((entry) => entry.entryId)).toEqual(originalEntryIds)
    expect(snapshot(queue).entries.map((entry) => entry.track.title)).toEqual([
      'Refreshed a',
      'Refreshed b',
      'Refreshed c'
    ])
    expect(snapshot(queue).currentIndex).toBe(1)
    expect(snapshot(queue).context).toEqual({ kind: 'album', label: 'Record' })
  })

  it('drops vanished non-current tracks and handles a vanished current track by clearing', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 1)

    queue.reconcile((id) => (id === 'a' ? null : track(id)))
    expect(ids(queue)).toEqual(['b', 'c'])
    expect(snapshot(queue).currentIndex).toBe(0)

    expect(queue.reconcile((id) => (id === 'b' ? null : track(id)))).toBeNull()
    expect(ids(queue)).toEqual([])
    expect(currentId(queue)).toBeNull()
    expect(snapshot(queue).context).toBeNull()
  })

  it('leaves a queue without a current entry untouched when reconciling', () => {
    const queue = new PlaybackQueue()
    expect(queue.reconcile(() => track('x'))).toBeNull()
    expect(ids(queue)).toEqual([])
    expect(snapshot(queue).version).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { PlaybackQueue } from '../src/renderer/player/queue'
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

function currentId(queue: PlaybackQueue): string | null {
  return queue.current()?.id ?? null
}

describe('PlaybackQueue', () => {
  it('starts empty', () => {
    const queue = new PlaybackQueue()

    expect(queue.current()).toBeNull()
    expect(queue.getTracks()).toEqual([])
    expect(queue.getCurrentIndex()).toBe(-1)
    expect(queue.hasNext()).toBe(false)
    expect(queue.hasPrevious()).toBe(false)
    expect(queue.next()).toBeNull()
    expect(queue.previous()).toBeNull()
  })

  it('sets the queue and returns the requested current track', () => {
    const queue = new PlaybackQueue()

    expect(queue.setQueue(tracks)?.id).toBe('a')
    expect(queue.setQueue(tracks, 1)?.id).toBe('b')
    expect(currentId(queue)).toBe('b')
    expect(queue.getCurrentIndex()).toBe(1)
    expect(queue.getTracks().map((item) => item.id)).toEqual(['a', 'b', 'c'])
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

    expect(queue.setQueue(tracks, startIndex)?.id).toBe(expected)
    expect(currentId(queue)).toBe(expected)
  })

  it('clears the queue when setQueue receives an empty list', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 1)

    expect(queue.setQueue([])).toBeNull()
    expect(queue.current()).toBeNull()
    expect(queue.getCurrentIndex()).toBe(-1)
    expect(queue.getTracks()).toEqual([])
    expect(queue.hasNext()).toBe(false)
    expect(queue.hasPrevious()).toBe(false)
  })

  it('resets the index when a new queue is set', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 2)

    expect(queue.setQueue([track('z')], 9)?.id).toBe('z')
    expect(queue.getCurrentIndex()).toBe(0)
  })

  it('moves forward and stops at the end', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 0)

    expect(queue.hasPrevious()).toBe(false)
    expect(queue.previous()).toBeNull()
    expect(queue.getCurrentIndex()).toBe(0)

    expect(queue.next()?.id).toBe('b')
    expect(queue.hasNext()).toBe(true)
    expect(queue.hasPrevious()).toBe(true)

    expect(queue.next()?.id).toBe('c')
    expect(queue.hasNext()).toBe(false)
    expect(queue.next()).toBeNull()
    expect(queue.getCurrentIndex()).toBe(2)
  })

  it('moves backward and stops at the start', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 2)

    expect(queue.previous()?.id).toBe('b')
    expect(queue.previous()?.id).toBe('a')
    expect(queue.hasPrevious()).toBe(false)
    expect(queue.previous()).toBeNull()
    expect(queue.getCurrentIndex()).toBe(0)
  })

  it('copies the input array instead of keeping the caller reference', () => {
    const source = [track('a'), track('b')]
    const queue = new PlaybackQueue()
    queue.setQueue(source, 1)

    source.push(track('c'))
    source[0] = track('x')

    expect(queue.getTracks().map((item) => item.id)).toEqual(['a', 'b'])
    expect(currentId(queue)).toBe('b')
  })
})

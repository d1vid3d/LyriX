import { describe, expect, it, vi } from 'vitest'
import { LyricsController } from '../src/renderer/lyrics/lyricsController'
import type { LyricsState } from '../src/renderer/lyrics/lyricsController'
import type { LyricsResult } from '../src/shared/types'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function lyricText(label: string): string {
  return `[00:01.00]${label}`
}

describe('LyricsController', () => {
  it('ignores a response for a track that is no longer current', async () => {
    const pending = new Map<string, Deferred<LyricsResult | null>>()
    const fetchLyrics = vi.fn((trackId: string) => {
      const request = deferred<LyricsResult | null>()
      pending.set(trackId, request)
      return request.promise
    })

    const controller = new LyricsController(fetchLyrics)
    const states: LyricsState[] = []
    controller.subscribe((state) => states.push(state))

    controller.setTrack('a')
    expect(controller.getState()).toMatchObject({ status: 'loading', trackId: 'a' })

    controller.setTrack('b')
    expect(controller.getState()).toMatchObject({ status: 'loading', trackId: 'b' })

    pending.get('a')?.resolve({ text: lyricText('A'), source: 'test' })
    await flush()

    expect(controller.getState()).toMatchObject({ status: 'loading', trackId: 'b' })
    expect(states.some((state) => state.status === 'ready' && state.trackId === 'a')).toBe(false)

    pending.get('b')?.resolve({ text: lyricText('B'), source: 'test' })
    await flush()

    expect(controller.getState().status).toBe('ready')
    expect(controller.getState().trackId).toBe('b')
    expect(controller.getState().doc?.lines[0]?.text).toBe('B')
  })

  it('reuses cached parsed documents', async () => {
    const fetchLyrics = vi.fn(async (trackId: string) => ({
      text: lyricText(trackId),
      source: 'test'
    }))
    const controller = new LyricsController(fetchLyrics)

    controller.setTrack('a')
    await flush()
    controller.setTrack('b')
    await flush()

    expect(fetchLyrics).toHaveBeenCalledTimes(2)

    controller.setTrack('a')
    expect(controller.getState().status).toBe('ready')
    expect(controller.getState().trackId).toBe('a')
    expect(controller.getState().doc?.lines[0]?.text).toBe('a')
    expect(fetchLyrics).toHaveBeenCalledTimes(2)
  })

  it('evicts the least recently used document beyond the cache limit', async () => {
    const fetchLyrics = vi.fn(async (trackId: string) => ({
      text: lyricText(trackId),
      source: 'test'
    }))
    const controller = new LyricsController(fetchLyrics, { cacheLimit: 2 })

    controller.setTrack('a')
    await flush()
    controller.setTrack('b')
    await flush()
    controller.setTrack('a')
    expect(fetchLyrics).toHaveBeenCalledTimes(2)

    controller.setTrack('c')
    await flush()
    expect(fetchLyrics).toHaveBeenCalledTimes(3)

    // "a" was refreshed before "c", so "b" is the evicted entry.
    controller.setTrack('b')
    await flush()
    expect(fetchLyrics).toHaveBeenCalledTimes(4)

    // "c" is still cached after "b" replaced "a".
    controller.setTrack('c')
    expect(controller.getState().status).toBe('ready')
    expect(fetchLyrics).toHaveBeenCalledTimes(4)

    controller.setTrack('a')
    await flush()
    expect(fetchLyrics).toHaveBeenCalledTimes(5)
  })

  it('caches a missing-lyrics result and reports the none state', async () => {
    const fetchLyrics = vi.fn(async () => null)
    const controller = new LyricsController(fetchLyrics)

    controller.setTrack('a')
    await flush()
    expect(controller.getState()).toMatchObject({ status: 'none', doc: null, trackId: 'a' })

    controller.setTrack('b')
    await flush()
    controller.setTrack('a')
    expect(controller.getState().status).toBe('none')
    expect(fetchLyrics).toHaveBeenCalledTimes(2)
  })

  it('treats empty text as no lyrics and parses timed text', async () => {
    const fetchLyrics = vi.fn(async (trackId: string) =>
      trackId === 'empty' ? { text: '   ', source: 'test' } : { text: lyricText('Line'), source: 'test' }
    )
    const controller = new LyricsController(fetchLyrics)

    controller.setTrack('empty')
    await flush()
    expect(controller.getState().status).toBe('none')

    controller.setTrack('timed')
    await flush()
    expect(controller.getState().status).toBe('ready')
    expect(controller.getState().doc?.timed).toBe(true)
    expect(controller.getState().doc?.lines[0]?.start).toBeCloseTo(1, 6)
  })

  it('clears state when the track is reset', async () => {
    const fetchLyrics = vi.fn(async () => ({ text: lyricText('A'), source: 'test' }))
    const controller = new LyricsController(fetchLyrics)

    controller.setTrack('a')
    await flush()
    controller.setTrack(null)

    expect(controller.getState()).toEqual({ status: 'none', doc: null, trackId: null })
  })
})

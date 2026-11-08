import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../src/shared/types'
import type { PlaybackEngine, PlaybackEventName } from '../src/renderer/player/engine'
import { PlaybackQueue } from '../src/renderer/player/queue'
import { SessionController } from '../src/renderer/session/sessionController'
import { SESSION_QUEUE_DEBOUNCE_MS } from '../src/renderer/session/sessionTiming'

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

const tracks = [track('a'), track('b'), track('c')]

class FakeEngine {
  position = 0
  duration = 100
  playing = false
  listeners = new Map<string, Set<(payload: unknown) => void>>()

  load(): void {}
  play(): Promise<void> {
    return Promise.resolve()
  }
  pause(): void {}
  seek(seconds: number): void {
    this.position = seconds
  }
  setVolume(): void {}
  getPosition(): number {
    return this.position
  }
  getDuration(): number {
    return this.duration
  }
  isPlaying(): boolean {
    return this.playing
  }
  on(event: string, listener: (payload: unknown) => void): () => void {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener)
    this.listeners.set(event, set)
    return () => set.delete(listener)
  }
  emit(event: PlaybackEventName, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload)
  }
}

function setup() {
  const queue = new PlaybackQueue()
  const engine = new FakeEngine()
  const saveQueue = vi.fn()
  const savePosition = vi.fn()
  const clock = { value: 0 }
  const controller = new SessionController({
    queue,
    engine: engine as unknown as PlaybackEngine,
    saveQueue,
    savePosition,
    now: () => clock.value
  })
  return { queue, engine, saveQueue, savePosition, clock, controller }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SessionController', () => {
  it('does nothing before start, including restored state', () => {
    vi.useFakeTimers()
    const { queue, saveQueue, savePosition, controller } = setup()
    queue.setQueue(tracks, 0)

    vi.advanceTimersByTime(SESSION_QUEUE_DEBOUNCE_MS * 2)
    expect(saveQueue).not.toHaveBeenCalled()
    expect(savePosition).not.toHaveBeenCalled()

    controller.start()
    vi.advanceTimersByTime(SESSION_QUEUE_DEBOUNCE_MS * 2)
    expect(saveQueue).not.toHaveBeenCalled()
    expect(savePosition).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('debounces queue writes and sends the latest state once', () => {
    vi.useFakeTimers()
    const { queue, saveQueue, controller } = setup()
    queue.setQueue(tracks, 0)
    controller.start()

    queue.addToQueue([track('d')])
    vi.advanceTimersByTime(SESSION_QUEUE_DEBOUNCE_MS - 1)
    queue.remove(queue.getSnapshot().entries[2]?.entryId ?? '')
    vi.advanceTimersByTime(SESSION_QUEUE_DEBOUNCE_MS - 1)
    expect(saveQueue).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(saveQueue).toHaveBeenCalledTimes(1)
    expect(saveQueue.mock.calls[0][0].entries.map((entry: { trackId: string }) => entry.trackId)).toEqual([
      'a',
      'b',
      'd'
    ])
    controller.dispose()
  })

  it('throttles time updates while playing but bypasses the interval on pause', () => {
    vi.useFakeTimers()
    const { engine, queue, savePosition, clock, controller } = setup()
    queue.setQueue(tracks, 0)
    controller.start()
    engine.playing = true

    engine.emit('timeupdate', 10)
    expect(savePosition).not.toHaveBeenCalled()

    clock.value = 5000
    engine.emit('timeupdate', 20)
    expect(savePosition).toHaveBeenCalledTimes(1)
    expect(savePosition.mock.calls[0][0]).toEqual({
      entryId: queue.getSnapshot().current?.entryId,
      trackId: 'a',
      position: 20
    })

    clock.value = 5001
    engine.emit('pause')
    expect(savePosition).toHaveBeenCalledTimes(2)
    controller.dispose()
  })

  it('saves position 0 immediately on a track change', () => {
    vi.useFakeTimers()
    const { engine, queue, savePosition, controller } = setup()
    queue.setQueue(tracks, 0)
    controller.start()
    savePosition.mockClear()

    engine.position = 42
    engine.emit('timeupdate', 42)
    queue.advance('skip')

    expect(savePosition).toHaveBeenCalledTimes(1)
    expect(savePosition.mock.calls[0][0]).toMatchObject({ trackId: 'b', position: 0 })
    controller.dispose()
  })

  it('flushes both queue and position immediately', () => {
    vi.useFakeTimers()
    const { engine, queue, saveQueue, savePosition, controller } = setup()
    queue.setQueue(tracks, 0)
    controller.start()
    engine.position = 12

    controller.flush()
    expect(saveQueue).toHaveBeenCalledTimes(1)
    expect(savePosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ trackId: 'a', position: 12 })
    )
    controller.dispose()
  })

  it('notifies the session on a seek-end hook even inside the interval', () => {
    vi.useFakeTimers()
    const { engine, queue, savePosition, clock, controller } = setup()
    queue.setQueue(tracks, 0)
    controller.start()
    engine.playing = true

    clock.value = 5000
    engine.emit('timeupdate', 20)
    savePosition.mockClear()

    clock.value = 5100
    controller.noteSeek()
    expect(savePosition).toHaveBeenCalledTimes(1)
    controller.dispose()
  })
})

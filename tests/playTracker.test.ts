import { describe, expect, it, vi } from 'vitest'
import { PlayTracker, thresholdFor } from '../src/renderer/history/playTracker'

function tracker(maxTickMs = 2000) {
  const onCounted = vi.fn()
  return {
    onCounted,
    tracker: new PlayTracker({ onCounted, maxTickMs })
  }
}

describe('thresholdFor', () => {
  it('uses min(30 s, 50% duration) and 30 s for unknown durations', () => {
    expect(thresholdFor(20)).toBe(10_000)
    expect(thresholdFor(200)).toBe(30_000)
    expect(thresholdFor(null)).toBe(30_000)
    expect(thresholdFor(0)).toBe(30_000)
    expect(thresholdFor(Number.NaN)).toBe(30_000)
  })
})

describe('PlayTracker', () => {
  it('counts a short track after 50% of its duration, exactly once', () => {
    const { tracker: play, onCounted } = tracker()
    play.start({ trackId: 'a', durationSec: 2 }, 0)

    play.tick(0, true, 'a')
    play.tick(500, true, 'a')
    expect(onCounted).not.toHaveBeenCalled()
    play.tick(1000, true, 'a')
    expect(onCounted).toHaveBeenCalledWith('a')

    play.tick(1500, true, 'a')
    play.tick(2000, true, 'a')
    expect(onCounted).toHaveBeenCalledTimes(1)
  })

  it('caps at 30 s for long and unknown-duration tracks', () => {
    const long = tracker()
    long.tracker.start({ trackId: 'a', durationSec: 200 }, 0)
    long.tracker.tick(0, true, 'a')
    for (let time = 1000; time < 29_000; time += 1000) {
      long.tracker.tick(time, true, 'a')
    }
    expect(long.onCounted).not.toHaveBeenCalled()
    long.tracker.tick(30_000, true, 'a')
    expect(long.onCounted).toHaveBeenCalledTimes(1)

    const unknown = tracker()
    unknown.tracker.start({ trackId: 'b', durationSec: null }, 0)
    unknown.tracker.tick(0, true, 'b')
    for (let time = 1000; time < 30_000; time += 1000) unknown.tracker.tick(time, true, 'b')
    expect(unknown.onCounted).not.toHaveBeenCalled()
    unknown.tracker.tick(30_000, true, 'b')
    expect(unknown.onCounted).toHaveBeenCalledWith('b')
  })

  it('does not accumulate while paused or during the resume gap', () => {
    const { tracker: play, onCounted } = tracker()
    play.start({ trackId: 'a', durationSec: 10 }, 0)

    play.tick(0, true, 'a')
    play.tick(1000, true, 'a')
    play.tick(2000, false, 'a')
    play.tick(20_000, true, 'a')
    expect(onCounted).not.toHaveBeenCalled()
    play.tick(21_000, true, 'a')
    expect(onCounted).not.toHaveBeenCalled()
  })

  it('caps a single tick delta so sleep/hibernate cannot add minutes', () => {
    const { tracker: play, onCounted } = tracker(2000)
    play.start({ trackId: 'a', durationSec: 10 }, 0)

    play.tick(0, true, 'a')
    play.tick(120_000, true, 'a')
    expect(onCounted).not.toHaveBeenCalled()

    play.tick(122_000, true, 'a')
    play.tick(124_000, true, 'a')
    play.tick(126_000, true, 'a')
    play.tick(128_000, true, 'a')
    expect(onCounted).toHaveBeenCalledTimes(1)
  })

  it('starts a new instance on repeat-one restart and can count again', () => {
    const { tracker: play, onCounted } = tracker()
    const entry = { trackId: 'a', durationSec: 2 }
    play.start(entry, 0)
    play.tick(0, true, 'a')
    play.tick(1000, true, 'a')
    expect(onCounted).toHaveBeenCalledTimes(1)

    play.restart(entry, 1000)
    play.tick(1000, true, 'a')
    play.tick(2000, true, 'a')
    expect(onCounted).toHaveBeenCalledTimes(2)
  })

  it('resume is not a restart, but play after finish starts a new instance', () => {
    const { tracker: play, onCounted } = tracker()
    play.start({ trackId: 'a', durationSec: 2 }, 0)
    play.tick(0, true, 'a')
    play.tick(900, true, 'a')

    play.play({ trackId: 'a', durationSec: 2 }, 1000)
    play.tick(1000, true, 'a')
    play.tick(2000, true, 'a')
    expect(onCounted).toHaveBeenCalledTimes(1)

    play.finish()
    play.play({ trackId: 'a', durationSec: 2 }, 3000)
    play.tick(3000, true, 'a')
    play.tick(4000, true, 'a')
    expect(onCounted).toHaveBeenCalledTimes(2)
  })

  it('treats a different queue entry for the same track as a new instance', () => {
    const { tracker: play, onCounted } = tracker()
    play.start({ trackId: 'a', entryId: 'entry-1', durationSec: 2 }, 0)
    play.tick(0, true, 'entry-1')
    play.tick(1000, true, 'entry-1')
    expect(onCounted).toHaveBeenCalledTimes(1)

    play.play({ trackId: 'a', entryId: 'entry-2', durationSec: 2 }, 1000)
    play.tick(1000, true, 'entry-2')
    play.tick(2000, true, 'entry-2')
    expect(onCounted).toHaveBeenCalledTimes(2)
  })

  it('changing track or failing before the threshold never counts', () => {
    const { tracker: play, onCounted } = tracker()
    play.start({ trackId: 'a', durationSec: 20 }, 0)
    play.tick(0, true, 'a')
    play.tick(5000, true, 'a')

    play.play({ trackId: 'b', durationSec: 20 }, 5000)
    play.tick(5000, true, 'b')
    play.tick(10_000, true, 'b')
    play.fail()
    play.tick(20_000, true, 'b')
    expect(onCounted).not.toHaveBeenCalled()
  })

  it('a restored paused session does not count until it actually plays', () => {
    const { tracker: play, onCounted } = tracker()
    play.start({ trackId: 'a', durationSec: 2 }, 0)
    play.tick(0, false, 'a')
    play.tick(1000, false, 'a')
    expect(onCounted).not.toHaveBeenCalled()

    play.play({ trackId: 'a', durationSec: 2 }, 5000)
    play.tick(5000, true, 'a')
    play.tick(6000, true, 'a')
    expect(onCounted).toHaveBeenCalledTimes(1)
  })
})

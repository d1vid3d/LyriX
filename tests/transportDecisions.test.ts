import { describe, expect, it } from 'vitest'
import type { QueueEntry } from '../src/renderer/player/queue'
import {
  decideEndedAction,
  decideFailureAction,
  decidePreviousAction,
  nextRepeatMode
} from '../src/renderer/player/transportDecisions'
import type { Track } from '../src/shared/types'

function entry(id: string): QueueEntry {
  const track: Track = {
    id,
    title: id,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNumber: null,
    discNumber: null,
    year: null,
    duration: 0,
    url: `media://track/${id}`
  }
  return { entryId: `entry-${id}`, track, origin: 'context' }
}

describe('decideEndedAction', () => {
  it('stops when advance returns null', () => {
    expect(decideEndedAction(entry('a'), null)).toEqual({ type: 'stop' })
  })

  it('plays a different returned entry', () => {
    expect(decideEndedAction(entry('a'), entry('b'))).toEqual({
      type: 'play',
      entry: entry('b')
    })
  })

  it('restarts when repeat one returns the same entry', () => {
    const current = entry('a')
    expect(decideEndedAction(current, current)).toEqual({ type: 'restart', entry: current })
  })
})

describe('decidePreviousAction', () => {
  it('restarts the current track after more than three seconds', () => {
    expect(decidePreviousAction(3.1, entry('a'))).toEqual({ type: 'restart' })
  })

  it('uses the previous entry at three seconds or less', () => {
    expect(decidePreviousAction(3, entry('a'))).toEqual({ type: 'play', entry: entry('a') })
  })

  it('restarts at the first entry when there is no previous entry', () => {
    expect(decidePreviousAction(0, null)).toEqual({ type: 'restart' })
  })
})

describe('decideFailureAction', () => {
  it('skips until every entry in the queue has failed once', () => {
    expect(decideFailureAction(3, 0)).toEqual({ action: 'skip', failures: 1 })
    expect(decideFailureAction(3, 1)).toEqual({ action: 'skip', failures: 2 })
    expect(decideFailureAction(3, 2)).toEqual({ action: 'stop', failures: 3 })
  })

  it('stops immediately for a single-entry queue', () => {
    expect(decideFailureAction(1, 0)).toEqual({ action: 'stop', failures: 1 })
  })

  it('cannot skip an empty queue', () => {
    expect(decideFailureAction(0, 0)).toEqual({ action: 'skip', failures: 1 })
  })

  it('normalizes bad failure counters', () => {
    expect(decideFailureAction(3, Number.NaN)).toEqual({ action: 'skip', failures: 1 })
    expect(decideFailureAction(3, -5)).toEqual({ action: 'skip', failures: 1 })
  })
})

describe('nextRepeatMode', () => {
  it('cycles off -> all -> one -> off', () => {
    expect(nextRepeatMode('off')).toBe('all')
    expect(nextRepeatMode('all')).toBe('one')
    expect(nextRepeatMode('one')).toBe('off')
  })
})

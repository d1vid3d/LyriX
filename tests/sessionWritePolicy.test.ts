import { describe, expect, it } from 'vitest'
import { decideSessionWrites } from '../src/main/sessionWritePolicy'

const base = {
  lastQueueKey: null,
  lastPositionKey: null,
  lastPositionWriteAt: 0,
  nextQueueKey: 'queue-1',
  nextPositionKey: 'entry-1:100.0',
  now: 1000,
  positionIntervalMs: 1000
}

describe('decideSessionWrites', () => {
  it('writes both files on the first update', () => {
    expect(decideSessionWrites(base)).toEqual({ writeQueue: true, writePosition: true })
  })

  it('writes nothing when both payloads are unchanged', () => {
    expect(
      decideSessionWrites({
        ...base,
        lastQueueKey: 'queue-1',
        lastPositionKey: 'entry-1:100.0',
        lastPositionWriteAt: 900
      })
    ).toEqual({ writeQueue: false, writePosition: false })
  })

  it('writes the queue whenever its payload changes', () => {
    expect(
      decideSessionWrites({
        ...base,
        lastQueueKey: 'queue-1',
        lastPositionKey: 'entry-1:100.0',
        lastPositionWriteAt: 900,
        nextQueueKey: 'queue-2'
      })
    ).toEqual({ writeQueue: true, writePosition: false })
  })

  it('throttles position-only changes to the interval', () => {
    expect(
      decideSessionWrites({
        ...base,
        lastQueueKey: 'queue-1',
        lastPositionKey: 'entry-1:100.0',
        lastPositionWriteAt: 900,
        nextPositionKey: 'entry-1:130.0',
        now: 1500
      }).writePosition
    ).toBe(false)

    expect(
      decideSessionWrites({
        ...base,
        lastQueueKey: 'queue-1',
        lastPositionKey: 'entry-1:100.0',
        lastPositionWriteAt: 900,
        nextPositionKey: 'entry-1:130.0',
        now: 1900
      }).writePosition
    ).toBe(true)
  })

  it('writes a track change position immediately after the interval resets', () => {
    expect(
      decideSessionWrites({
        ...base,
        lastQueueKey: 'queue-1',
        lastPositionKey: 'entry-1:100.0',
        lastPositionWriteAt: 0,
        nextPositionKey: 'entry-2:0.0',
        now: 1200
      }).writePosition
    ).toBe(true)
  })
})

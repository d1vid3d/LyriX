import { describe, expect, it } from 'vitest'
import {
  SESSION_POSITION_INTERVAL_MS,
  shouldSendPosition
} from '../src/renderer/session/sessionTiming'

describe('shouldSendPosition', () => {
  it('sends time updates at most once per interval', () => {
    expect(shouldSendPosition('timeupdate', 0, 0)).toBe(false)
    expect(shouldSendPosition('timeupdate', 1000, 1000 + SESSION_POSITION_INTERVAL_MS - 1)).toBe(
      false
    )
    expect(shouldSendPosition('timeupdate', 1000, 1000 + SESSION_POSITION_INTERVAL_MS)).toBe(true)
  })

  it('always sends pause, ended, seek, track change, and flush updates', () => {
    for (const reason of ['pause', 'ended', 'seek', 'trackChange', 'flush'] as const) {
      expect(shouldSendPosition(reason, 1000, 1001)).toBe(true)
    }
  })
})

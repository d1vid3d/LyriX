/** Pure timing rules for renderer-side session updates. */

export const SESSION_QUEUE_DEBOUNCE_MS = 1000
export const SESSION_POSITION_INTERVAL_MS = 5000

export type PositionUpdateReason =
  | 'timeupdate'
  | 'pause'
  | 'ended'
  | 'seek'
  | 'trackChange'
  | 'flush'

/**
 * Playback position is sent at most every ~5 s while playing. Pause, seek end, track change, and
 * an explicit flush bypass the interval.
 */
export function shouldSendPosition(
  reason: PositionUpdateReason,
  lastSentAt: number,
  now: number
): boolean {
  if (reason !== 'timeupdate') return true
  return now - lastSentAt >= SESSION_POSITION_INTERVAL_MS
}

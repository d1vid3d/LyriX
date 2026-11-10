import type { QueueEntry, RepeatMode } from './queue'

export type EndedAction =
  { type: 'play'; entry: QueueEntry } | { type: 'restart'; entry: QueueEntry } | { type: 'stop' }

export type PreviousAction = { type: 'restart' } | { type: 'play'; entry: QueueEntry }

export interface FailureDecision {
  action: 'skip' | 'stop'
  failures: number
}

/** A returned entry identical to the current one means "replay it" (repeat one). */
export function decideEndedAction(
  current: QueueEntry | null,
  next: QueueEntry | null
): EndedAction {
  if (!next) return { type: 'stop' }
  if (current && next.entryId === current.entryId) return { type: 'restart', entry: next }
  return { type: 'play', entry: next }
}

export function decidePreviousAction(
  position: number,
  previous: QueueEntry | null
): PreviousAction {
  if (Number.isFinite(position) && position > 3) return { type: 'restart' }
  if (previous) return { type: 'play', entry: previous }
  return { type: 'restart' }
}

/**
 * Failures advance like a skip. Stopping after one failure per queue entry prevents repeat-all
 * from looping forever on a queue where every file is broken.
 */
export function decideFailureAction(
  entryCount: number,
  consecutiveFailures: number
): FailureDecision {
  const failures =
    (Number.isFinite(consecutiveFailures) ? Math.max(0, Math.trunc(consecutiveFailures)) : 0) + 1

  if (entryCount > 0 && failures >= entryCount) return { action: 'stop', failures }
  return { action: 'skip', failures }
}

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === 'off') return 'all'
  if (mode === 'all') return 'one'
  return 'off'
}

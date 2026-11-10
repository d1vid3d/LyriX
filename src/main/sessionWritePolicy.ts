/** Pure "when to write" policy for the two session files. */

export interface SessionWriteInput {
  /** Serialized queue payload last written this run, or null before the first write. */
  lastQueueKey: string | null
  /** Entry id + rounded position last written, or null before the first position write. */
  lastPositionKey: string | null
  /** Timestamp of the last position write this run (0 when none). */
  lastPositionWriteAt: number
  nextQueueKey: string
  nextPositionKey: string
  now: number
  positionIntervalMs: number
}

export interface SessionWriteDecision {
  writeQueue: boolean
  writePosition: boolean
}

/**
 * Queue writes are change-driven (the renderer already debounces them). Position writes are
 * change-driven too, but throttled to `positionIntervalMs`; the first position update of a run
 * writes immediately. Callers force both through an explicit flush on quit/close.
 */
export function decideSessionWrites(input: SessionWriteInput): SessionWriteDecision {
  const queueChanged = input.lastQueueKey === null || input.lastQueueKey !== input.nextQueueKey
  const positionChanged =
    input.lastPositionKey === null || input.lastPositionKey !== input.nextPositionKey
  const intervalElapsed =
    input.lastPositionWriteAt === 0 ||
    input.now - input.lastPositionWriteAt >= input.positionIntervalMs

  return {
    writeQueue: queueChanged,
    writePosition: positionChanged && intervalElapsed
  }
}

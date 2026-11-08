import type { QueueEntry } from './types'

export type QueueRandom = () => number

function randomIndex(random: QueueRandom, max: number): number {
  const value = random()
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.floor(value * (max + 1))))
}

/** Fisher-Yates shuffle over a copy; the input array is never mutated. */
export function shuffleArray<T>(items: readonly T[], random: QueueRandom): T[] {
  const result = [...items]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(random, index)
    const current = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = current
  }

  return result
}

/**
 * Shuffles a full queue and, when possible, prevents the new first entry from being the
 * same track that just played. A queue containing only that track cannot avoid the repeat.
 */
export function shuffleEntriesAvoidingTrack(
  entries: readonly QueueEntry[],
  random: QueueRandom,
  playedTrackId: string
): QueueEntry[] {
  const shuffled = shuffleArray(entries, random)
  if (shuffled.length <= 1 || shuffled[0].track.id !== playedTrackId) return shuffled

  const swapIndex = shuffled.findIndex((entry) => entry.track.id !== playedTrackId)
  if (swapIndex > 0) {
    const first = shuffled[0]
    shuffled[0] = shuffled[swapIndex]
    shuffled[swapIndex] = first
  }

  return shuffled
}

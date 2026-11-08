import type { QueueContext, QueueOrigin, RepeatMode, Track } from '../../../shared/types'

export type { QueueContext, QueueOrigin, RepeatMode } from '../../../shared/types'

export interface QueueEntry {
  entryId: string
  track: Track
  origin: QueueOrigin
}

export interface QueueSnapshot {
  readonly entries: readonly QueueEntry[]
  readonly currentIndex: number
  readonly current: QueueEntry | null
  readonly shuffle: boolean
  readonly repeat: RepeatMode
  readonly context: QueueContext | null
  readonly version: number
}

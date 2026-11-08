import type { RepeatMode, Track } from '../../../shared/types'

export type { RepeatMode } from '../../../shared/types'

export type QueueOrigin = 'context' | 'playNext' | 'added'

export interface QueueEntry {
  entryId: string
  track: Track
  origin: QueueOrigin
}

export interface QueueContext {
  kind: 'album' | 'artist' | 'tracks' | 'search' | 'other'
  label: string
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

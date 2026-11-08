import type { Track } from '../../shared/types'

/** Long titles are shortened so a toast never fills the window. */
export const TOAST_TITLE_MAX = 40

export const TOAST_MESSAGES = {
  removedFromQueue: 'Removed from queue',
  queueCleared: 'Queue cleared',
  albumMissing: "Couldn't open that album",
  artistMissing: "Couldn't open that artist",
  revealFailed: "Couldn't show the file"
} as const

export function truncateTitle(title: string): string {
  if (title.length <= TOAST_TITLE_MAX) return title
  return `${title.slice(0, TOAST_TITLE_MAX - 1)}…`
}

export function playingNextMessage(tracks: readonly Track[]): string {
  if (tracks.length === 0) return ''
  if (tracks.length === 1) return `Playing next: ${truncateTitle(tracks[0].title)}`
  return `Playing next: ${tracks.length} tracks`
}

export function addedToQueueMessage(tracks: readonly Track[]): string {
  if (tracks.length === 0) return ''
  if (tracks.length === 1) return `Added to queue: ${truncateTitle(tracks[0].title)}`
  return `Added ${tracks.length} tracks to queue`
}

import { describe, expect, it } from 'vitest'
import type { Track } from '../src/shared/types'
import {
  addedToQueueMessage,
  playingNextMessage,
  TOAST_MESSAGES,
  TOAST_TITLE_MAX,
  truncateTitle
} from '../src/renderer/menus/toastMessages'

function track(id: string, title: string): Track {
  return {
    id,
    title,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNumber: null,
    discNumber: null,
    year: null,
    duration: 10,
    url: `media://track/${id}`
  }
}

describe('toast messages', () => {
  it('uses the exact status strings', () => {
    expect(TOAST_MESSAGES).toEqual({
      removedFromQueue: 'Removed from queue',
      queueCleared: 'Queue cleared',
      albumMissing: "Couldn't open that album",
      artistMissing: "Couldn't open that artist",
      revealFailed: "Couldn't show the file"
    })
  })

  it('names a single track and pluralizes multiple tracks', () => {
    const one = [track('a', 'First Song')]
    const two = [...one, track('b', 'Second Song')]

    expect(playingNextMessage(one)).toBe('Playing next: First Song')
    expect(playingNextMessage(two)).toBe('Playing next: 2 tracks')
    expect(addedToQueueMessage(one)).toBe('Added to queue: First Song')
    expect(addedToQueueMessage(two)).toBe('Added 2 tracks to queue')
  })

  it('returns an empty string for no tracks', () => {
    expect(playingNextMessage([])).toBe('')
    expect(addedToQueueMessage([])).toBe('')
  })

  it('truncates long titles to the maximum length', () => {
    const title = 'x'.repeat(TOAST_TITLE_MAX + 10)
    const truncated = truncateTitle(title)

    expect(truncated).toHaveLength(TOAST_TITLE_MAX)
    expect(truncated.endsWith('…')).toBe(true)
    expect(truncateTitle('short')).toBe('short')
    expect(truncateTitle('y'.repeat(TOAST_TITLE_MAX))).toHaveLength(TOAST_TITLE_MAX)
  })
})

import { describe, expect, it } from 'vitest'
import type { Album, Track } from '../src/shared/types'
import { PlaybackQueue } from '../src/renderer/player/queue'
import {
  buildQueuePanelModel,
  QUEUE_EMPTY_TEXT,
  queueContextLabel
} from '../src/renderer/queue/queuePanelModel'

function track(id: string, duration = 10): Track {
  return {
    id,
    title: `Title ${id}`,
    artist: `Artist ${id}`,
    album: 'Album',
    albumArtist: 'Album Artist',
    trackNumber: null,
    discNumber: null,
    year: null,
    duration,
    url: `media://track/${id}`
  }
}

const tracks = [track('a', 10), track('b', 20), track('c', 30), track('d', 40)]

function albumFor(value: Track): Album {
  return {
    id: `album-${value.id}`,
    title: 'Album',
    artist: 'Album Artist',
    year: null,
    coverUrl: `media://cover/album-${value.id}`,
    tracks: [value]
  }
}

function model(snapshot: ReturnType<PlaybackQueue['getSnapshot']>, historyCollapsed = true) {
  return buildQueuePanelModel({
    snapshot,
    historyCollapsed,
    findAlbum: (value) => albumFor(value)
  })
}

describe('buildQueuePanelModel', () => {
  it('describes an empty queue with the required empty text', () => {
    const queue = new PlaybackQueue()
    const result = model(queue.getSnapshot())

    expect(result.empty).toBe(true)
    expect(result.rows).toEqual([{ kind: 'empty', id: 'empty', label: QUEUE_EMPTY_TEXT }])
    expect(result.contextLabel).toBe('Queue')
    expect(result.countLabel).toBe('0 tracks')
    expect(result.durationLabel).toBe('0:00')
    expect(result.clearDisabled).toBe(true)
    expect(result.currentRowIndex).toBe(-1)
  })

  it('splits current, upcoming, and collapsed history into fixed rows', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 2, {
      context: { kind: 'album', label: 'Test Album' }
    })

    const result = model(queue.getSnapshot(), true)

    expect(result.empty).toBe(false)
    expect(result.contextLabel).toBe('Album · Test Album')
    expect(result.countLabel).toBe('4 tracks')
    expect(result.durationLabel).toBe('1:40')
    expect(result.summaryLabel).toBe('4 tracks · 1:40')
    expect(result.currentEntryId).toBe('entry-3')
    expect(result.currentIndex).toBe(2)
    expect(result.historyCount).toBe(2)
    expect(result.upcomingRowCount).toBe(1)
    expect(result.upcomingEntryIds).toEqual(['entry-4'])
    expect(result.clearDisabled).toBe(false)

    expect(result.rows.map((row) => row.kind)).toEqual([
      'section',
      'entry',
      'section',
      'entry',
      'section'
    ])
    expect(result.rows.map((row) => row.id)).toEqual([
      'section-now-playing',
      'entry-entry-3',
      'section-upcoming',
      'entry-entry-4',
      'section-history'
    ])

    const upcoming = result.rows[3]
    expect(upcoming.kind).toBe('entry')
    if (upcoming.kind !== 'entry') return
    expect(upcoming.section).toBe('upcoming')
    expect(upcoming.entryIndex).toBe(3)
    expect(upcoming.canDrag).toBe(true)
    expect(upcoming.canRemove).toBe(true)
    expect(upcoming.albumId).toBe('album-d')
    expect(upcoming.coverUrl).toBe('media://cover/album-d')
    expect(upcoming.durationLabel).toBe('0:40')

    const current = result.rows[1]
    expect(current.kind).toBe('entry')
    if (current.kind !== 'entry') return
    expect(current.canDrag).toBe(false)
    expect(current.canRemove).toBe(false)
    expect(result.currentRowIndex).toBe(1)
    expect(result.upcomingStartRow).toBe(3)

    const history = result.rows[4]
    expect(history.kind).toBe('section')
    if (history.kind !== 'section') return
    expect(history.collapsible).toBe(true)
    expect(history.collapsed).toBe(true)
    expect(history.count).toBe(2)
  })

  it('renders history entry rows when expanded', () => {
    const queue = new PlaybackQueue()
    queue.setQueue(tracks, 2)

    const result = model(queue.getSnapshot(), false)

    const historyRows = result.rows.filter(
      (row) => row.kind === 'entry' && row.section === 'history'
    )
    expect(historyRows).toHaveLength(2)
    expect(historyRows.map((row) => (row.kind === 'entry' ? row.entryIndex : -1))).toEqual([0, 1])
    expect(historyRows.map((row) => (row.kind === 'entry' ? row.entryId : ''))).toEqual([
      'entry-1',
      'entry-2'
    ])
  })

  it('treats all entries as upcoming when there is no current entry', () => {
    const queue = new PlaybackQueue()
    queue.playNext(tracks.slice(0, 2))

    const result = model(queue.getSnapshot())

    expect(result.currentEntryId).toBeNull()
    expect(result.currentIndex).toBe(-1)
    expect(result.currentRowIndex).toBe(-1)
    expect(result.historyCount).toBe(0)
    expect(result.upcomingRowCount).toBe(2)
    expect(result.upcomingEntryIds).toEqual(['entry-1', 'entry-2'])
    expect(result.rows.map((row) => row.kind)).toEqual(['section', 'entry', 'entry'])
    expect(result.upcomingStartRow).toBe(1)
    expect(result.clearDisabled).toBe(false)
  })

  it('uses singular counts and trims empty album lookups', () => {
    const queue = new PlaybackQueue()
    queue.setQueue([tracks[0]], 0, { context: { kind: 'search', label: 'drums' } })

    const result = buildQueuePanelModel({
      snapshot: queue.getSnapshot(),
      historyCollapsed: true,
      findAlbum: () => null
    })

    expect(result.countLabel).toBe('1 track')
    expect(result.contextLabel).toBe('Search · drums')
    const current = result.rows[1]
    expect(current.kind).toBe('entry')
    if (current.kind !== 'entry') return
    expect(current.albumId).toBeNull()
    expect(current.coverUrl).toBeNull()
    expect(current.artistName).toBe(tracks[0].artist)
  })
})

describe('queueContextLabel', () => {
  it('labels each context kind', () => {
    expect(queueContextLabel(null)).toBe('Queue')
    expect(queueContextLabel({ kind: 'album', label: 'A' })).toBe('Album · A')
    expect(queueContextLabel({ kind: 'artist', label: 'B' })).toBe('Artist · B')
    expect(queueContextLabel({ kind: 'tracks', label: 'ignored' })).toBe('Tracks')
    expect(queueContextLabel({ kind: 'search', label: 'x' })).toBe('Search · x')
    expect(queueContextLabel({ kind: 'search', label: '' })).toBe('Search results')
    expect(queueContextLabel({ kind: 'other', label: 'Mix' })).toBe('Mix')
    expect(queueContextLabel({ kind: 'other', label: '' })).toBe('Queue')
  })
})

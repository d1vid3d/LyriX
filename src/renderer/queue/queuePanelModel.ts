import type { Album, Track } from '../../shared/types'
import type { QueueContext, QueueSnapshot } from '../player/queue'
import { formatTime } from '../src/format'

/** Every queue-panel row, including section headers, uses this height so VirtualList stays exact. */
export const QUEUE_PANEL_ROW_HEIGHT = 56

export const QUEUE_EMPTY_TEXT = 'Nothing queued. Play something to start.'

export type QueuePanelEntrySection = 'current' | 'upcoming' | 'history'

export interface QueuePanelEntryRow {
  kind: 'entry'
  id: string
  section: QueuePanelEntrySection
  entryId: string
  entryIndex: number
  track: Track
  albumId: string | null
  coverUrl: string | null
  artistName: string | null
  isCurrent: boolean
  canDrag: boolean
  canRemove: boolean
  durationLabel: string
}

export interface QueuePanelSectionRow {
  kind: 'section'
  id: string
  section: 'nowPlaying' | 'upcoming' | 'history'
  label: string
  count: number
  collapsible: boolean
  collapsed: boolean
}

export interface QueuePanelEmptyRow {
  kind: 'empty'
  id: 'empty'
  label: string
}

export type QueuePanelRow = QueuePanelEntryRow | QueuePanelSectionRow | QueuePanelEmptyRow

export interface QueuePanelModel {
  rows: QueuePanelRow[]
  empty: boolean
  contextLabel: string
  countLabel: string
  durationLabel: string
  summaryLabel: string
  historyCollapsed: boolean
  historyCount: number
  currentEntryId: string | null
  currentIndex: number
  currentRowIndex: number
  upcomingStartRow: number
  upcomingRowCount: number
  upcomingEntryIds: string[]
  clearDisabled: boolean
}

export interface QueuePanelModelInput {
  snapshot: QueueSnapshot
  historyCollapsed: boolean
  findAlbum(track: Track): Album | null
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralForm}`
}

/** A concise, stable header label for the queue's originating context. */
export function queueContextLabel(context: QueueContext | null): string {
  if (!context) return 'Queue'

  switch (context.kind) {
    case 'album':
      return `Album · ${context.label}`
    case 'artist':
      return `Artist · ${context.label}`
    case 'search':
      return context.label ? `Search · ${context.label}` : 'Search results'
    case 'tracks':
      return 'Tracks'
    case 'favorites':
      return 'Favorites'
    case 'recent':
      return 'Recently played'
    default:
      return context.label || 'Queue'
  }
}

/**
 * Builds the flat, virtualizable row list. History is collapsed by default, and every row is the
 * same height so one fixed-height scroller can render the entire panel.
 */
export function buildQueuePanelModel(input: QueuePanelModelInput): QueuePanelModel {
  const { snapshot, historyCollapsed, findAlbum } = input
  const entries = snapshot.entries
  const currentIndex = snapshot.currentIndex
  const hasCurrent = currentIndex >= 0 && currentIndex < entries.length
  const upcoming = hasCurrent ? entries.slice(currentIndex + 1) : entries
  const history = hasCurrent ? entries.slice(0, currentIndex) : []
  const rows: QueuePanelRow[] = []

  let currentRowIndex = -1
  let upcomingStartRow = -1

  if (hasCurrent) {
    const entry = entries[currentIndex]
    rows.push({
      kind: 'section',
      id: 'section-now-playing',
      section: 'nowPlaying',
      label: 'Now playing',
      count: 1,
      collapsible: false,
      collapsed: false
    })
    currentRowIndex = rows.length
    rows.push(entryRow(entry, currentIndex, 'current', findAlbum(entry.track)))
  }

  if (upcoming.length > 0) {
    rows.push({
      kind: 'section',
      id: 'section-upcoming',
      section: 'upcoming',
      label: 'Next up',
      count: upcoming.length,
      collapsible: false,
      collapsed: false
    })
    upcomingStartRow = rows.length
    for (let offset = 0; offset < upcoming.length; offset += 1) {
      const entry = upcoming[offset]
      rows.push(entryRow(entry, currentIndex + 1 + offset, 'upcoming', findAlbum(entry.track)))
    }
  }

  if (history.length > 0) {
    rows.push({
      kind: 'section',
      id: 'section-history',
      section: 'history',
      label: 'History',
      count: history.length,
      collapsible: true,
      collapsed: historyCollapsed
    })

    if (!historyCollapsed) {
      for (let index = 0; index < history.length; index += 1) {
        rows.push(entryRow(history[index], index, 'history', findAlbum(history[index].track)))
      }
    }
  }

  const empty = entries.length === 0
  if (empty) {
    rows.push({ kind: 'empty', id: 'empty', label: QUEUE_EMPTY_TEXT })
  }

  const totalDuration = entries.reduce((sum, entry) => sum + entry.track.duration, 0)
  const countLabel = plural(entries.length, 'track', 'tracks')
  const durationLabel = formatTime(totalDuration)

  return {
    rows,
    empty,
    contextLabel: queueContextLabel(snapshot.context),
    countLabel,
    durationLabel,
    summaryLabel: `${countLabel} · ${durationLabel}`,
    historyCollapsed,
    historyCount: history.length,
    currentEntryId: hasCurrent ? entries[currentIndex].entryId : null,
    currentIndex: hasCurrent ? currentIndex : -1,
    currentRowIndex,
    upcomingStartRow,
    upcomingRowCount: upcoming.length,
    upcomingEntryIds: upcoming.map((entry) => entry.entryId),
    clearDisabled: upcoming.length === 0
  }
}

function entryRow(
  entry: QueueSnapshot['entries'][number],
  entryIndex: number,
  section: QueuePanelEntrySection,
  album: Album | null
): QueuePanelEntryRow {
  return {
    kind: 'entry',
    id: `entry-${entry.entryId}`,
    section,
    entryId: entry.entryId,
    entryIndex,
    track: entry.track,
    albumId: album?.id ?? null,
    coverUrl: album?.coverUrl ?? null,
    artistName: album?.artist ?? entry.track.artist,
    isCurrent: section === 'current',
    canDrag: section === 'upcoming',
    canRemove: section !== 'current',
    durationLabel: formatTime(entry.track.duration)
  }
}

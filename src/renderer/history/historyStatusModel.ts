import type { HistoryBlockedReason, HistoryRecordingState } from '../../shared/types'

export type HistoryStatusTone = 'ok' | 'muted' | 'warning' | 'error'

export interface HistoryStatusModel {
  text: string
  tone: HistoryStatusTone
  showWhy: boolean
  whyReason: HistoryBlockedReason | null
}

export interface HistoryEmptyModel {
  text: string
  startAction: boolean
}

/** Pure status line for the Recently played header. */
export function buildHistoryStatusModel(recording: HistoryRecordingState): HistoryStatusModel {
  if (recording.status === 'recording') {
    return {
      text: "Recording to this library's LyrixData folder",
      tone: 'ok',
      showWhy: false,
      whyReason: null
    }
  }

  if (recording.status === 'not-created') {
    return {
      text: "History isn't being recorded yet. Turn on Record history to create this library's LyrixData folder.",
      tone: 'muted',
      showWhy: false,
      whyReason: null
    }
  }

  if (recording.status === 'blocked') {
    switch (recording.reason) {
      case 'read-only':
        return {
          text: "This library is read-only. Play history can't be recorded.",
          tone: 'warning',
          showWhy: true,
          whyReason: 'read-only'
        }
      case 'unavailable':
        return {
          text: "This library's location isn't available right now.",
          tone: 'error',
          showWhy: true,
          whyReason: 'unavailable'
        }
      case 'newer-version':
        return {
          text: "This library's LyriX data was created by a newer version of LyriX.",
          tone: 'warning',
          showWhy: true,
          whyReason: 'newer-version'
        }
      default:
        break
    }
  }

  return {
    text: "History isn't being recorded for this library.",
    tone: 'muted',
    showWhy: false,
    whyReason: null
  }
}

/** Empty-state text/action for the Recently played view. */
export function buildHistoryEmptyModel(
  recording: HistoryRecordingState,
  hasItems: boolean
): HistoryEmptyModel | null {
  if (hasItems) return null

  if (!recording.enabled) {
    return {
      text: "History isn't being recorded for this library. Start recording",
      startAction: true
    }
  }

  return { text: 'Nothing played yet.', startAction: false }
}

export function blockedHistoryMessage(reason: HistoryBlockedReason): string {
  if (reason === 'read-only') {
    return "Play history can't be saved here (library is read-only)"
  }
  if (reason === 'unavailable') {
    return "Play history can't be saved here (library is unavailable)"
  }
  return "Play history can't be saved here (library was written by a newer LyriX)"
}

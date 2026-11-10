import { describe, expect, it } from 'vitest'
import { formatHistoryMeta, formatRelativePlayedAt } from '../src/renderer/history/relativeTime'
import {
  blockedHistoryMessage,
  buildHistoryEmptyModel,
  buildHistoryStatusModel
} from '../src/renderer/history/historyStatusModel'
import type { HistoryRecordingState } from '../src/shared/types'

const now = new Date(2026, 10, 10, 15, 0, 0).getTime()

function recording(overrides: Partial<HistoryRecordingState> = {}): HistoryRecordingState {
  return { enabled: false, status: 'off', reason: null, ...overrides }
}

describe('formatRelativePlayedAt', () => {
  it('formats recent, same-day, yesterday, and older timestamps', () => {
    expect(formatRelativePlayedAt(now - 30_000, now)).toBe('Just now')
    expect(formatRelativePlayedAt(now - 12 * 60_000, now)).toBe('12 min ago')
    expect(formatRelativePlayedAt(new Date(2026, 10, 10, 12, 32).getTime(), now)).toBe(
      'Today 12:32'
    )
    expect(formatRelativePlayedAt(new Date(2026, 10, 9, 23, 0).getTime(), now)).toBe('Yesterday')
    expect(formatRelativePlayedAt(new Date(2026, 10, 1, 9, 0).getTime(), now)).toBe(
      new Date(2026, 10, 1).toLocaleDateString()
    )
  })

  it('formats the plays meta label', () => {
    expect(formatHistoryMeta({ playCount: 1, lastPlayedAt: now }, now)).toBe('1 play · Just now')
    expect(formatHistoryMeta({ playCount: 4, lastPlayedAt: now - 60_000 }, now)).toBe(
      '4 plays · 1 min ago'
    )
  })
})

describe('history status and empty models', () => {
  it('returns the exact status-line variants', () => {
    expect(buildHistoryStatusModel(recording({ enabled: true, status: 'recording' }))).toEqual({
      text: "Recording to this library's LyrixData folder",
      tone: 'ok',
      showWhy: false,
      whyReason: null
    })
    expect(buildHistoryStatusModel(recording())).toMatchObject({
      text: "History isn't being recorded for this library.",
      tone: 'muted'
    })
    expect(buildHistoryStatusModel(recording({ status: 'not-created' })).text).toContain(
      'Turn on Record history'
    )
  })

  it('shows Why for blocked variants', () => {
    for (const reason of ['read-only', 'unavailable', 'newer-version'] as const) {
      const model = buildHistoryStatusModel(recording({ enabled: true, status: 'blocked', reason }))
      expect(model.showWhy).toBe(true)
      expect(model.whyReason).toBe(reason)
    }
  })

  it('builds the off/empty action and recorded-empty states', () => {
    expect(buildHistoryEmptyModel(recording(), false)).toEqual({
      text: "History isn't being recorded for this library. Start recording",
      startAction: true
    })
    expect(
      buildHistoryEmptyModel(recording({ enabled: true, status: 'recording' }), false)
    ).toEqual({
      text: 'Nothing played yet.',
      startAction: false
    })
    expect(buildHistoryEmptyModel(recording({ enabled: true }), true)).toBeNull()
  })

  it('builds one quiet message per blocked reason', () => {
    expect(blockedHistoryMessage('read-only')).toContain('read-only')
    expect(blockedHistoryMessage('unavailable')).toContain('unavailable')
    expect(blockedHistoryMessage('newer-version')).toContain('newer LyriX')
  })
})

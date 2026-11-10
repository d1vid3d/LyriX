import { describe, expect, it } from 'vitest'
import {
  parseHistoryGetInput,
  parseHistoryRecordInput,
  parseHistoryRecordingInput
} from '../src/main/lyrixdata/historyIpc'
import { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT } from '../src/main/lyrixdata/historyLog'
import {
  DEFAULT_HISTORY_RECORDING,
  historyRecordingFromLibrary
} from '../src/main/lyrixdata/formats'

const id = 'a'.repeat(40)

describe('history IPC validation', () => {
  it('defaults and clamps history:get limits', () => {
    expect(parseHistoryGetInput(undefined)).toEqual({ limit: HISTORY_DEFAULT_LIMIT })
    expect(parseHistoryGetInput({})).toEqual({ limit: HISTORY_DEFAULT_LIMIT })
    expect(parseHistoryGetInput({ limit: 12.9 })).toEqual({ limit: 12 })
    expect(parseHistoryGetInput({ limit: 0 })).toEqual({ limit: 1 })
    expect(parseHistoryGetInput({ limit: 99_999 })).toEqual({ limit: HISTORY_MAX_LIMIT })
    expect(parseHistoryGetInput({ limit: '20' })).toEqual({ limit: HISTORY_DEFAULT_LIMIT })
  })

  it('accepts only valid track ids and booleans', () => {
    expect(parseHistoryRecordInput(id)).toBe(id)
    expect(parseHistoryRecordInput('bad')).toBeNull()
    expect(parseHistoryRecordInput(42)).toBeNull()

    expect(parseHistoryRecordingInput(true)).toBe(true)
    expect(parseHistoryRecordingInput(false)).toBe(false)
    expect(parseHistoryRecordingInput('true')).toBeNull()
  })
})

describe('library history flag', () => {
  it('uses the named default when the flag is missing or invalid', () => {
    expect(DEFAULT_HISTORY_RECORDING).toBe(false)
    expect(historyRecordingFromLibrary(null)).toBe(false)
    expect(
      historyRecordingFromLibrary({
        version: 1,
        libraryId: 'id',
        createdAt: 1,
        writtenBy: { app: 'LyriX', appVersion: '0', machineId: 'm', at: 1 }
      })
    ).toBe(false)
    expect(
      historyRecordingFromLibrary({
        version: 1,
        libraryId: 'id',
        createdAt: 1,
        writtenBy: { app: 'LyriX', appVersion: '0', machineId: 'm', at: 1 },
        historyRecording: true
      })
    ).toBe(true)
  })
})

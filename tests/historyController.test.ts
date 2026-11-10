import { describe, expect, it, vi } from 'vitest'
import type { HistorySetResult, HistoryState } from '../src/shared/types'
import { HistoryController } from '../src/renderer/history/historyController'
import type { HistoryApi } from '../src/renderer/history/historyController'

const trackId = 'a'.repeat(40)

function state(overrides: Partial<HistoryState> = {}): HistoryState {
  return {
    recent: [],
    recording: { enabled: false, status: 'off', reason: null },
    ...overrides
  }
}

function setup() {
  let listener: ((value: HistoryState) => void) | null = null
  const api = {
    getHistory: vi.fn(async () => state()),
    recordPlay: vi.fn(async () => ({ ok: true })),
    setHistoryRecording: vi.fn(async () => ({ ok: true, state: state() })),
    clearHistory: vi.fn(async () => ({ ok: true, state: state() })),
    onHistoryChanged: vi.fn((callback: (value: HistoryState) => void) => {
      listener = callback
      return () => undefined
    })
  } satisfies HistoryApi
  const toast = vi.fn()
  const onWriteBlocked = vi.fn()
  const controller = new HistoryController({ api, toast, onWriteBlocked })
  return {
    api,
    toast,
    onWriteBlocked,
    controller,
    emit: (value: HistoryState) => listener?.(value)
  }
}

describe('HistoryController', () => {
  it('records passively without toasts or the disclaimer', async () => {
    const { api, toast, onWriteBlocked, controller } = setup()
    api.recordPlay.mockResolvedValueOnce({ ok: false })

    controller.record(trackId)
    await Promise.resolve()
    expect(api.recordPlay).toHaveBeenCalledWith(trackId)
    expect(toast).not.toHaveBeenCalled()
    expect(onWriteBlocked).not.toHaveBeenCalled()
  })

  it('shows one quiet toast per library when recording becomes blocked', async () => {
    const { api, toast, controller, emit } = setup()
    controller.start()
    api.getHistory.mockResolvedValueOnce(
      state({ recording: { enabled: true, status: 'recording', reason: null } })
    )
    await controller.reload()

    const blocked = state({
      recording: { enabled: true, status: 'blocked', reason: 'read-only' }
    })
    emit(blocked)
    emit(blocked)
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toContain('read-only')

    api.getHistory.mockResolvedValueOnce(
      state({ recording: { enabled: true, status: 'recording', reason: null } })
    )
    controller.noteLibraryChanged()
    await Promise.resolve()
    await Promise.resolve()
    emit(blocked)
    expect(toast).toHaveBeenCalledTimes(2)
  })

  it('routes explicit recording and clear failures to the disclaimer', async () => {
    const { api, onWriteBlocked, controller } = setup()
    api.setHistoryRecording.mockResolvedValueOnce({ ok: false, reason: 'unavailable' })

    await controller.setRecording(true)
    expect(onWriteBlocked).toHaveBeenCalledWith('unavailable', expect.any(Function))

    api.clearHistory.mockResolvedValueOnce({ ok: false, reason: 'read-only' })
    await controller.clear()
    expect(onWriteBlocked).toHaveBeenLastCalledWith('read-only', expect.any(Function))
  })

  it('applies explicit results to state', async () => {
    const { api, controller } = setup()
    const next = state({
      recent: [{ trackId, lastPlayedAt: 10, playCount: 1 }],
      recording: { enabled: true, status: 'recording', reason: null }
    })
    api.setHistoryRecording.mockResolvedValueOnce({ ok: true, state: next } as HistorySetResult)

    await controller.setRecording(true)
    expect(controller.getState().items).toEqual(next.recent)
    expect(controller.getState().recording.status).toBe('recording')
  })
})

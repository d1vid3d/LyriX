import { describe, expect, it, vi } from 'vitest'
import type { FavoritesSetResult, FavoritesState } from '../src/shared/types'
import { FAVORITE_TOASTS, FavoritesController } from '../src/renderer/favorites/favoritesController'
import type { FavoritesApi } from '../src/renderer/favorites/favoritesController'

const trackId = 'a'.repeat(40)

function emptyState(): FavoritesState {
  return { items: [], missing: [] }
}

function setup() {
  let resolveSet: ((result: FavoritesSetResult) => void) | null = null
  let resolveRemove: ((result: FavoritesSetResult) => void) | null = null
  const listener: { current: ((state: FavoritesState) => void) | null } = { current: null }
  const api = {
    getFavorites: vi.fn(async () => emptyState()),
    setFavorite: vi.fn(
      () =>
        new Promise<FavoritesSetResult>((resolve) => {
          resolveSet = resolve
        })
    ),
    removeMissingFavorites: vi.fn(
      () =>
        new Promise<FavoritesSetResult>((resolve) => {
          resolveRemove = resolve
        })
    ),
    onFavoritesChanged: vi.fn((value: (state: FavoritesState) => void) => {
      listener.current = value
      return () => undefined
    })
  } satisfies FavoritesApi
  const onWriteBlocked = vi.fn()
  const onStateChange = vi.fn()
  const controller = new FavoritesController({
    api,
    toast: vi.fn(),
    onWriteBlocked,
    onStateChange
  })
  return {
    api,
    controller,
    onWriteBlocked,
    onStateChange,
    listener,
    resolveSet: (result: FavoritesSetResult) => resolveSet?.(result),
    resolveRemove: (result: FavoritesSetResult) => resolveRemove?.(result)
  }
}

describe('FavoritesController', () => {
  it('updates optimistically, then confirms and toasts', async () => {
    const { controller, resolveSet, api } = setup()
    const pending = controller.toggle(trackId)

    expect(controller.isFavorite(trackId)).toBe(true)
    expect(api.setFavorite).toHaveBeenCalledWith([trackId], true)

    resolveSet({ ok: true, state: { items: [{ trackId, addedAt: 5 }], missing: [] } })
    await pending
    expect(controller.isFavorite(trackId)).toBe(true)
    expect(controller.getState().addedAt.get(trackId)).toBe(5)
  })

  it('rolls back on failure and exposes the disclaimer retry action', async () => {
    const { controller, resolveSet, onWriteBlocked, api } = setup()
    const pending = controller.toggle(trackId)
    resolveSet({ ok: false, reason: 'read-only' })
    await pending

    expect(controller.isFavorite(trackId)).toBe(false)
    expect(onWriteBlocked).toHaveBeenCalledTimes(1)
    expect(onWriteBlocked.mock.calls[0][0]).toBe('read-only')

    const retry = onWriteBlocked.mock.calls[0][1] as () => void
    api.setFavorite.mockResolvedValueOnce({
      ok: true,
      state: { items: [{ trackId, addedAt: 9 }], missing: [] }
    })
    retry()
    await Promise.resolve()
    await Promise.resolve()
    expect(controller.isFavorite(trackId)).toBe(true)
    expect(api.setFavorite).toHaveBeenCalledTimes(2)
  })

  it('applies external favorites:changed events and reloads', async () => {
    const { controller, listener, api } = setup()
    controller.start()
    expect(api.onFavoritesChanged).toHaveBeenCalled()

    listener.current?.({ items: [{ trackId, addedAt: 2 }], missing: [] })
    expect(controller.isFavorite(trackId)).toBe(true)

    api.getFavorites.mockResolvedValueOnce({ items: [], missing: [] })
    await controller.reload()
    expect(controller.isFavorite(trackId)).toBe(false)
  })

  it('removes missing entries optimistically and rolls back on failure', async () => {
    const { controller, listener, resolveRemove, onWriteBlocked } = setup()
    controller.start()
    listener.current?.({
      items: [],
      missing: [{ path: 'gone.flac', title: 'Gone', artist: '', album: '', addedAt: 1 }]
    })

    const pending = controller.removeMissing()
    expect(controller.getState().missing).toHaveLength(0)
    resolveRemove({ ok: false, reason: 'unavailable' })
    await pending
    expect(controller.getState().missing).toHaveLength(1)
    expect(onWriteBlocked).toHaveBeenCalledWith('unavailable', expect.any(Function))
  })

  it('uses the exact success toast strings', () => {
    expect(FAVORITE_TOASTS).toEqual({
      added: 'Added to Favorites',
      removed: 'Removed from Favorites',
      removedMissing: 'Removed missing favorites'
    })
  })
})

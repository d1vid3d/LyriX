import type { FavoritesSetResult, FavoritesState, FavoriteMissing } from '../../shared/types'
import type { FavoritesWriteFailure } from '../../shared/types'
import { disclaimerReasonFromFailure } from './dataDisclaimerModel'
import type { DisclaimerReason } from './dataDisclaimerModel'

export interface FavoritesApi {
  getFavorites(): Promise<FavoritesState>
  setFavorite(trackIds: string[], favorite: boolean): Promise<FavoritesSetResult>
  removeMissingFavorites(): Promise<FavoritesSetResult>
  onFavoritesChanged(listener: (state: FavoritesState) => void): () => void
}

export interface FavoritesControllerState {
  ids: ReadonlySet<string>
  addedAt: ReadonlyMap<string, number>
  missing: readonly FavoriteMissing[]
  loaded: boolean
}

export interface FavoritesControllerDeps {
  api: FavoritesApi
  toast(message: string): void
  onWriteBlocked(reason: DisclaimerReason, retryAction: () => void): void
  onStateChange?(state: FavoritesControllerState): void
}

const EMPTY: FavoritesControllerState = {
  ids: new Set(),
  addedAt: new Map(),
  missing: [],
  loaded: false
}

export const FAVORITE_TOASTS = {
  added: 'Added to Favorites',
  removed: 'Removed from Favorites',
  removedMissing: 'Removed missing favorites'
} as const

/**
 * Owns favorites in the renderer. Writes are optimistic and roll back when main refuses; failures
 * open the disclaimer with a retry closure instead of a toast.
 */
export class FavoritesController {
  private readonly deps: FavoritesControllerDeps
  private state: FavoritesControllerState = EMPTY
  private readonly listeners = new Set<(state: FavoritesControllerState) => void>()

  constructor(deps: FavoritesControllerDeps) {
    this.deps = deps
  }

  getState(): FavoritesControllerState {
    return this.state
  }

  isFavorite(trackId: string): boolean {
    return this.state.ids.has(trackId)
  }

  subscribe(listener: (state: FavoritesControllerState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async reload(): Promise<void> {
    try {
      this.apply(await this.deps.api.getFavorites())
    } catch (error) {
      console.error('[renderer] Could not load favorites', error)
    }
  }

  async toggle(trackId: string): Promise<void> {
    await this.setMany([trackId], !this.isFavorite(trackId))
  }

  async setMany(trackIds: readonly string[], favorite: boolean): Promise<void> {
    const ids = trackIds.filter((id) => this.state.ids.has(id) !== favorite)
    if (ids.length === 0) return

    const previous = this.state
    const addedAt = new Map(this.state.addedAt)
    const nextIds = new Set(this.state.ids)
    const now = Date.now()
    for (const id of ids) {
      if (favorite) {
        nextIds.add(id)
        addedAt.set(id, now)
      } else {
        nextIds.delete(id)
        addedAt.delete(id)
      }
    }
    this.emit({ ...this.state, ids: nextIds, addedAt, loaded: true })

    const result = await this.request(ids, favorite)
    if (result.ok) {
      this.apply(result.state)
      this.deps.toast(favorite ? FAVORITE_TOASTS.added : FAVORITE_TOASTS.removed)
      return
    }

    this.emit(previous)
    this.block(result.reason, () => void this.setMany(ids, favorite))
  }

  async removeMissing(): Promise<void> {
    if (this.state.missing.length === 0) return

    const previous = this.state
    this.emit({ ...this.state, missing: [] })

    let result: FavoritesSetResult
    try {
      result = await this.deps.api.removeMissingFavorites()
    } catch (error) {
      console.error('[renderer] Could not remove missing favorites', error)
      result = { ok: false, reason: 'unavailable' }
    }

    if (result.ok) {
      this.apply(result.state)
      this.deps.toast(FAVORITE_TOASTS.removedMissing)
      return
    }

    this.emit(previous)
    this.block(result.reason, () => void this.removeMissing())
  }

  /** Subscribes to main-side changes (external edits and library re-resolution). */
  start(): () => void {
    return this.deps.api.onFavoritesChanged((state) => this.apply(state))
  }

  private async request(ids: readonly string[], favorite: boolean): Promise<FavoritesSetResult> {
    try {
      return await this.deps.api.setFavorite([...ids], favorite)
    } catch (error) {
      console.error('[renderer] Could not update favorites', error)
      return { ok: false, reason: 'unavailable' }
    }
  }

  private block(reason: FavoritesWriteFailure, retryAction: () => void): void {
    const disclaimer = disclaimerReasonFromFailure(reason)
    if (disclaimer) this.deps.onWriteBlocked(disclaimer, retryAction)
  }

  private apply(state: FavoritesState): void {
    const ids = new Set<string>()
    const addedAt = new Map<string, number>()
    for (const item of state.items) {
      ids.add(item.trackId)
      addedAt.set(item.trackId, item.addedAt)
    }
    this.emit({ ids, addedAt, missing: state.missing, loaded: true })
  }

  private emit(state: FavoritesControllerState): void {
    this.state = state
    this.deps.onStateChange?.(state)
    for (const listener of [...this.listeners]) listener(state)
  }
}

import type {
  Album,
  FavoritesSetResult,
  FavoritesState,
  FavoriteMissing
} from '../../shared/types'
import type { Track } from '../../shared/types'
import { validateFavoritesFile } from './formats'
import type { FavoritesFileItem } from './formats'
import { isValidFavoriteItem } from './formats'
import { isSafeRefPath, refPathKey } from './paths'
import type { LyrixDataStore } from './lyrixDataStore'
import {
  buildRefIndex,
  createTrackRef,
  resolveTrackRef
} from './trackRef'
import type { TrackRefIndex, TrackRefSource } from './trackRef'

export const MAX_FAVORITES = 100_000

export interface FavoritesStoreOptions {
  store: LyrixDataStore
  resolveTrackFile(trackId: string): string | null
  onStateChange(state: FavoritesState): void
}

interface MutationResult {
  changed: boolean
}

/**
 * Favorites are keyed by normalized portable path. Every mutation re-reads the file first, applies
 * the change, heals relinked refs, and writes through the serialized LyrixData store.
 */
export class FavoritesStore {
  private readonly options: FavoritesStoreOptions
  private root: string | null = null
  private index: TrackRefIndex | null = null
  private trackById = new Map<string, TrackRefSource>()
  private items = new Map<string, FavoritesFileItem>()
  private state: FavoritesState = { items: [], missing: [] }
  private emptyLibrary = false
  private mutationChain: Promise<unknown> = Promise.resolve()

  constructor(options: FavoritesStoreOptions) {
    this.options = options
  }

  getState(): FavoritesState {
    return this.state
  }

  /** Rebinds to a library snapshot and re-resolves everything against it. */
  async setLibrary(root: string | null, albums: readonly Album[]): Promise<FavoritesState> {
    this.root = root
    this.emptyLibrary = albums.length === 0
    this.buildIndex(albums)
    await this.reload()
    return this.state
  }

  async reload(): Promise<FavoritesState> {
    const read = await this.options.store.readFavorites()
    const next = new Map<string, FavoritesFileItem>()

    for (const raw of read.items) {
      if (!isValidFavoriteItem(raw)) continue
      if (!isSafeRefPath(raw.ref.path)) continue
      const key = refPathKey(raw.ref.path)
      if (!next.has(key) && next.size < MAX_FAVORITES) next.set(key, raw)
    }

    this.items = next
    this.updateState()
    return this.state
  }

  async add(trackIds: readonly string[]): Promise<FavoritesSetResult> {
    return this.mutate((map, now) => {
      let changed = false
      for (const trackId of trackIds) {
        if (map.size >= MAX_FAVORITES) break
        const source = this.trackById.get(trackId)
        if (!source) continue

        const key = refPathKey(source.ref.path)
        if (map.has(key)) continue

        map.set(key, {
          ref: { path: source.ref.path, fp: { ...source.ref.fp } },
          addedAt: now
        })
        changed = true
      }
      return changed
    })
  }

  async remove(trackIds: readonly string[]): Promise<FavoritesSetResult> {
    return this.mutate((map) => {
      const removedIds = new Set<string>()
      for (const trackId of trackIds) {
        const source = this.trackById.get(trackId)
        if (source) removedIds.add(refPathKey(source.ref.path))
      }

      let changed = false
      for (const key of [...map.keys()]) {
        if (removedIds.has(key)) {
          map.delete(key)
          changed = true
        }
      }
      return changed
    })
  }

  async removeMissing(paths: readonly string[]): Promise<FavoritesSetResult> {
    return this.mutate((map) => {
      let changed = false
      for (const path of paths) {
        const key = refPathKey(path)
        if (map.delete(key)) changed = true
      }
      return changed
    })
  }

  /** Removes every currently-unresolved entry without exposing paths to the renderer. */
  async removeAllMissing(): Promise<FavoritesSetResult> {
    if (!this.index || this.trackById.size === 0) {
      return { ok: false, reason: 'unavailable' }
    }

    return this.mutate((map) => {
      let changed = false
      for (const [key, item] of [...map]) {
        if (resolveTrackRef(item.ref, this.index as TrackRefIndex).status === 'missing') {
          map.delete(key)
          changed = true
        }
      }
      return changed
    })
  }

  private async mutate(apply: (map: Map<string, FavoritesFileItem>, now: number) => boolean) {
    const run = () => this.runMutation(apply)
    const result = this.mutationChain.then(run, run)
    this.mutationChain = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async runMutation(
    apply: (map: Map<string, FavoritesFileItem>, now: number) => boolean
  ) {
    if (!this.root || !this.index) return { ok: false, reason: 'unavailable' } as const

    const read = await this.options.store.readFavorites()
    if (read.newerVersion) return { ok: false, reason: 'newer-version' } as const

    const map = new Map<string, FavoritesFileItem>()
    for (const raw of read.items) {
      if (!isValidFavoriteItem(raw) || !isSafeRefPath(raw.ref.path)) continue
      const key = refPathKey(raw.ref.path)
      if (!map.has(key) && map.size < MAX_FAVORITES) map.set(key, raw)
    }

    this.heal(map)
    const changed = apply(map, Date.now())
    if (!changed) {
      this.items = map
      this.updateState()
      return { ok: true, state: this.state } as const
    }

    const write = await this.options.store.writeFavorites([...map.values()])
    if (!write.ok) return { ok: false, reason: write.reason } as const

    this.items = map
    this.updateState()
    return { ok: true, state: this.state } as const
  }

  /** Relinked refs are updated in memory; they only reach disk during a real mutation. */
  private heal(map: Map<string, FavoritesFileItem>): void {
    const index = this.index
    if (!index) return

    for (const [key, item] of map) {
      const resolution = resolveTrackRef(item.ref, index)
      if (resolution.status !== 'relinked') continue

      const healed: FavoritesFileItem = { ...item, ref: resolution.healedRef }
      const healedKey = refPathKey(healed.ref.path)
      map.delete(key)
      if (!map.has(healedKey)) map.set(healedKey, healed)
    }
  }

  private buildIndex(albums: readonly Album[]): void {
    const sources: Array<{ track: Track; filePath: string }> = []
    this.trackById = new Map()

    for (const album of albums) {
      for (const track of album.tracks) {
        const filePath = this.options.resolveTrackFile(track.id)
        if (!filePath) continue
        sources.push({ track, filePath })
      }
    }

    if (!this.root) {
      this.index = null
      return
    }

    this.index = buildRefIndex(sources, this.root)
    for (const source of this.index.byPath.values()) {
      this.trackById.set(source.track.id, source)
    }
  }

  private updateState(): void {
    const items: FavoritesState['items'] = []
    const missing: FavoriteMissing[] = []
    const seenTracks = new Set<string>()
    const index = this.index

    for (const item of this.items.values()) {
      if (!index) continue
      const resolution = resolveTrackRef(item.ref, index)

      if (resolution.status === 'missing') {
        missing.push({
          path: item.ref.path,
          title: item.ref.fp.title,
          artist: item.ref.fp.artist,
          album: item.ref.fp.album,
          addedAt: item.addedAt
        })
        continue
      }

      if (seenTracks.has(resolution.track.id)) continue
      seenTracks.add(resolution.track.id)
      items.push({ trackId: resolution.track.id, addedAt: item.addedAt })
    }

    this.state = { items, missing }
    this.options.onStateChange(this.state)
  }

  /** Exposed for tests: build a ref for a track in the current snapshot. */
  createRefForTrack(trackId: string): ReturnType<typeof createTrackRef> {
    if (!this.root) return null
    const source = this.trackById.get(trackId)
    if (!source) return null
    return createTrackRef(source.track, this.root, source.filePath)
  }

  isEmptyLibrary(): boolean {
    return this.emptyLibrary
  }
}

export type { FavoritesFileItem }
export { validateFavoritesFile }

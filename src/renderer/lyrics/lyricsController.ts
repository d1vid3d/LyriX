import { parseLyrics } from '../../shared/lyrics'
import type { LyricDocument } from '../../shared/lyrics'
import type { LyricsResult } from '../../shared/types'

export type LyricsStatus = 'loading' | 'ready' | 'none'

export interface LyricsState {
  status: LyricsStatus
  doc: LyricDocument | null
  trackId: string | null
}

export type LyricsFetcher = (trackId: string) => Promise<LyricsResult | null>

export interface LyricsControllerOptions {
  /** Number of parsed documents kept in memory (default 10). */
  cacheLimit?: number
}

const DEFAULT_CACHE_LIMIT = 10

/** Fetches and parses lyrics on demand. Contains no DOM or Electron references. */
export class LyricsController {
  private readonly fetchLyrics: LyricsFetcher
  private readonly cacheLimit: number
  private readonly cache = new Map<string, LyricDocument | null>()
  private readonly listeners = new Set<(state: LyricsState) => void>()
  private state: LyricsState = { status: 'none', doc: null, trackId: null }
  private requestGeneration = 0

  constructor(fetchLyrics: LyricsFetcher, options: LyricsControllerOptions = {}) {
    this.fetchLyrics = fetchLyrics
    const limit = options.cacheLimit ?? DEFAULT_CACHE_LIMIT
    this.cacheLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : DEFAULT_CACHE_LIMIT
  }

  getState(): LyricsState {
    return this.state
  }

  /** Listeners are called immediately with the current state. */
  subscribe(listener: (state: LyricsState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)

    return () => {
      this.listeners.delete(listener)
    }
  }

  setTrack(trackId: string | null): void {
    if (trackId === this.state.trackId) return

    const generation = ++this.requestGeneration

    if (trackId === null) {
      this.setState({ status: 'none', doc: null, trackId: null })
      return
    }

    if (this.cache.has(trackId)) {
      const doc = this.cache.get(trackId) ?? null
      this.touchCache(trackId)
      this.setState(
        doc
          ? { status: 'ready', doc, trackId }
          : { status: 'none', doc: null, trackId }
      )
      return
    }

    this.setState({ status: 'loading', doc: null, trackId })
    void this.load(trackId, generation)
  }

  private async load(trackId: string, generation: number): Promise<void> {
    try {
      const result = await this.fetchLyrics(trackId)
      if (generation !== this.requestGeneration) return

      const doc = result && result.text.trim() !== '' ? parseLyrics(result.text) : null
      const usable = doc && doc.lines.length > 0 ? doc : null

      this.remember(trackId, usable)
      this.setState(
        usable
          ? { status: 'ready', doc: usable, trackId }
          : { status: 'none', doc: null, trackId }
      )
    } catch (error) {
      if (generation !== this.requestGeneration) return

      console.error(`[lyrics] Could not load lyrics for ${trackId}`, error)
      this.remember(trackId, null)
      this.setState({ status: 'none', doc: null, trackId })
    }
  }

  private setState(next: LyricsState): void {
    if (
      next.status === this.state.status &&
      next.doc === this.state.doc &&
      next.trackId === this.state.trackId
    ) {
      return
    }

    this.state = next
    for (const listener of [...this.listeners]) listener(this.state)
  }

  private remember(trackId: string, doc: LyricDocument | null): void {
    this.cache.delete(trackId)
    this.cache.set(trackId, doc)

    while (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }

  private touchCache(trackId: string): void {
    if (!this.cache.has(trackId)) return
    const doc = this.cache.get(trackId) ?? null
    this.cache.delete(trackId)
    this.cache.set(trackId, doc)
  }
}

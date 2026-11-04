import { parseLyrics, selectLyricSource } from '../../shared/lyrics'
import type { LyricDocument, LyricFormat } from '../../shared/lyrics'
import type {
  LyricPreference,
  LyricSourceOption,
  LyricSources
} from '../../shared/lyrics/sources'

export type LyricsStatus = 'loading' | 'ready' | 'none'
export type LyricsSelectionMode = 'auto' | 'saved'

export interface LyricsSourceEntry {
  option: LyricSourceOption
  doc: LyricDocument | null
  format: LyricFormat | null
  lineCount: number
  warningCount: number
  usable: boolean
}

export interface LyricsState {
  status: LyricsStatus
  doc: LyricDocument | null
  trackId: string | null
  sources: LyricsSourceEntry[]
  selectedId: string | null
  mode: LyricsSelectionMode | null
  preference: LyricPreference
  expectedSidecarName: string
}

export interface LyricsControllerDeps {
  fetchSources(trackId: string): Promise<LyricSources | null>
  saveChoice(trackId: string, sourceId: string | null): Promise<void>
  savePreference(preference: LyricPreference): Promise<void>
  /** Initial preference; the library settings may update it later. */
  preference: LyricPreference
  /** Number of parsed source entries kept in memory (default 10). */
  cacheLimit?: number
}

export interface SetPreferenceOptions {
  /** Startup settings application should not write the value back. */
  persist?: boolean
}

interface CachedSources {
  entries: LyricsSourceEntry[]
  expectedSidecarName: string
  savedChoice: string | null
}

const DEFAULT_CACHE_LIMIT = 10

/** Fetches, parses, and selects lyric sources. Contains no DOM or Electron references. */
export class LyricsController {
  private readonly deps: LyricsControllerDeps
  private readonly cacheLimit: number
  private readonly cache = new Map<string, CachedSources>()
  private readonly listeners = new Set<(state: LyricsState) => void>()
  private preference: LyricPreference
  private state: LyricsState
  private requestGeneration = 0

  constructor(deps: LyricsControllerDeps) {
    this.deps = deps
    this.preference = deps.preference

    const limit = deps.cacheLimit ?? DEFAULT_CACHE_LIMIT
    this.cacheLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : DEFAULT_CACHE_LIMIT

    this.state = {
      status: 'none',
      doc: null,
      trackId: null,
      sources: [],
      selectedId: null,
      mode: null,
      preference: this.preference,
      expectedSidecarName: ''
    }
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
      this.setState(this.emptyState(null))
      return
    }

    const cached = this.cache.get(trackId)
    if (cached) {
      this.touchCache(trackId)
      this.applyEntry(trackId, cached, cached.savedChoice)
      return
    }

    this.setState({
      status: 'loading',
      doc: null,
      trackId,
      sources: [],
      selectedId: null,
      mode: null,
      preference: this.preference,
      expectedSidecarName: ''
    })
    void this.load(trackId, generation)
  }

  /** Switch immediately from the current entries and persist the choice. */
  selectSource(sourceId: string | null): void {
    const trackId = this.state.trackId
    if (!trackId) return

    const cached = this.cache.get(trackId)
    if (!cached) return

    if (sourceId === null) {
      cached.savedChoice = null
      this.applyEntry(trackId, cached, null)
      this.persistChoice(trackId, null)
      return
    }

    const target = cached.entries.find((entry) => entry.option.id === sourceId)
    if (!target || !target.usable) return

    cached.savedChoice = sourceId
    this.applyEntry(trackId, cached, sourceId)
    this.persistChoice(trackId, sourceId)
  }

  /** Persist the preference and recompute auto-selection for the current track. */
  setPreference(preference: LyricPreference, options: SetPreferenceOptions = {}): void {
    this.preference = preference

    if (options.persist !== false) {
      void this.deps
        .savePreference(preference)
        .catch((error) => console.error('[lyrics] Could not save the lyric preference', error))
    }

    const trackId = this.state.trackId
    if (!trackId) {
      this.setState({ ...this.state, preference })
      return
    }

    const cached = this.cache.get(trackId)
    if (cached) {
      this.applyEntry(trackId, cached, cached.savedChoice)
      return
    }

    this.setState({ ...this.state, preference })
  }

  /** Bypass the cache and refetch the current track, keeping its saved choice. */
  reload(): void {
    const trackId = this.state.trackId
    if (!trackId) return

    const generation = ++this.requestGeneration
    const savedChoice = this.cache.get(trackId)?.savedChoice ?? null
    this.cache.delete(trackId)

    this.setState({ ...this.state, status: 'loading', doc: null })
    void this.load(trackId, generation, savedChoice)
  }

  /**
   * Drop every cached source entry and refetch the current track. The current track's saved
   * choice is preserved so a library rescan never silently clears a manual selection.
   */
  clearCacheAndReload(): void {
    const trackId = this.state.trackId
    if (!trackId) {
      this.cache.clear()
      return
    }

    const cached = this.cache.get(trackId)
    const savedChoice = cached ? cached.savedChoice : undefined
    const generation = ++this.requestGeneration
    this.cache.clear()

    this.setState({ ...this.state, status: 'loading', doc: null })
    void this.load(trackId, generation, savedChoice)
  }

  private async load(
    trackId: string,
    generation: number,
    savedChoiceOverride?: string | null
  ): Promise<void> {
    try {
      const response = await this.deps.fetchSources(trackId)
      if (generation !== this.requestGeneration) return

      const cached = response
        ? this.buildCached(response)
        : { entries: [], expectedSidecarName: '', savedChoice: null }

      const savedChoice =
        savedChoiceOverride !== undefined ? savedChoiceOverride : cached.savedChoice
      cached.savedChoice = savedChoice

      this.remember(trackId, cached)
      this.applyEntry(trackId, cached, savedChoice)
      this.logSources(trackId, cached)
    } catch (error) {
      if (generation !== this.requestGeneration) return

      console.error(`[lyrics] Could not load lyric sources for ${trackId}`, error)
      const cached: CachedSources = {
        entries: [],
        expectedSidecarName: '',
        savedChoice: savedChoiceOverride !== undefined ? savedChoiceOverride : null
      }
      this.remember(trackId, cached)
      this.applyEntry(trackId, cached, cached.savedChoice)
    }
  }

  private buildCached(response: LyricSources): CachedSources {
    const entries: LyricsSourceEntry[] = response.options.map((option) => {
      const doc = option.available && option.text !== null ? parseLyrics(option.text) : null
      const usable = doc !== null && doc.lines.length > 0

      return {
        option,
        doc,
        format: doc?.format ?? null,
        lineCount: doc?.lines.length ?? 0,
        warningCount: doc?.warnings.length ?? 0,
        usable
      }
    })

    return {
      entries,
      expectedSidecarName: response.expectedSidecarName,
      savedChoice: response.savedChoice
    }
  }

  private applyEntry(trackId: string, cached: CachedSources, savedChoice: string | null): void {
    const selection = selectLyricSource(
      cached.entries.map((entry) => entry.option),
      {
        savedChoice,
        preference: this.preference,
        isUsable: (option) =>
          cached.entries.find((entry) => entry.option.id === option.id)?.usable === true
      }
    )

    const selected = selection
      ? (cached.entries.find((entry) => entry.option.id === selection.option.id) ?? null)
      : null
    const usableSelected = selected?.usable === true ? selected : null

    this.setState({
      status: usableSelected ? 'ready' : 'none',
      doc: usableSelected?.doc ?? null,
      trackId,
      sources: cached.entries,
      selectedId: usableSelected?.option.id ?? null,
      mode: usableSelected ? (selection?.mode ?? null) : null,
      preference: this.preference,
      expectedSidecarName: cached.expectedSidecarName
    })
  }

  private emptyState(trackId: string | null): LyricsState {
    return {
      status: 'none',
      doc: null,
      trackId,
      sources: [],
      selectedId: null,
      mode: null,
      preference: this.preference,
      expectedSidecarName: ''
    }
  }

  private persistChoice(trackId: string, sourceId: string | null): void {
    void this.deps
      .saveChoice(trackId, sourceId)
      .catch((error) => console.error('[lyrics] Could not save the lyric choice', error))
  }

  private logSources(trackId: string, cached: CachedSources): void {
    console.debug(
      `[lyrics] ${trackId} sources`,
      cached.entries.map((entry) => ({
        id: entry.option.id,
        available: entry.option.available,
        usable: entry.usable,
        format: entry.format,
        lines: entry.lineCount,
        warnings: entry.warningCount
      })),
      'selected',
      this.state.selectedId,
      this.state.mode
    )
  }

  private setState(next: LyricsState): void {
    if (
      next.status === this.state.status &&
      next.doc === this.state.doc &&
      next.trackId === this.state.trackId &&
      next.sources === this.state.sources &&
      next.selectedId === this.state.selectedId &&
      next.mode === this.state.mode &&
      next.preference === this.state.preference &&
      next.expectedSidecarName === this.state.expectedSidecarName
    ) {
      return
    }

    this.state = next
    for (const listener of [...this.listeners]) listener(this.state)
  }

  private remember(trackId: string, entry: CachedSources): void {
    this.cache.delete(trackId)
    this.cache.set(trackId, entry)

    while (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }

  private touchCache(trackId: string): void {
    const entry = this.cache.get(trackId)
    if (!entry) return
    this.cache.delete(trackId)
    this.cache.set(trackId, entry)
  }
}

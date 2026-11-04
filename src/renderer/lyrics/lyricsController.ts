import { parseLyrics, selectLyricSource } from '../../shared/lyrics'
import type { LyricDocument, LyricFormat } from '../../shared/lyrics'
import type {
  LyricPreference,
  LyricSourceOption,
  LyricSources
} from '../../shared/lyrics/sources'
import type { TranslationSettingsInput } from '../../shared/types'
import { buildTranslation, sameTranslation } from './translationState'
import type { TranslationState } from './translationState'

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
  translation: TranslationState
}

export interface LyricsControllerDeps {
  fetchSources(trackId: string): Promise<LyricSources | null>
  saveChoice(trackId: string, sourceId: string | null): Promise<void>
  savePreference(preference: LyricPreference): Promise<void>
  saveTranslationChoice(trackId: string, sourceId: string | null): Promise<void>
  saveTranslationSettings(input: TranslationSettingsInput): Promise<void>
  /** Initial preference; the library settings may update it later. */
  preference: LyricPreference
  /** Initial translation toggle from settings. */
  translationEnabled: boolean
  /** Initial sticky translation language from settings. */
  translationLanguage: string | null
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
  savedTranslationChoice: string | null
}

const DEFAULT_CACHE_LIMIT = 10

/** Fetches, parses, and selects lyric sources. Contains no DOM or Electron references. */
export class LyricsController {
  private readonly deps: LyricsControllerDeps
  private readonly cacheLimit: number
  private readonly cache = new Map<string, CachedSources>()
  private readonly listeners = new Set<(state: LyricsState) => void>()
  private preference: LyricPreference
  private translationEnabled: boolean
  private translationLanguage: string | null
  private state: LyricsState
  private requestGeneration = 0

  constructor(deps: LyricsControllerDeps) {
    this.deps = deps
    this.preference = deps.preference
    this.translationEnabled = deps.translationEnabled
    this.translationLanguage = deps.translationLanguage

    const limit = deps.cacheLimit ?? DEFAULT_CACHE_LIMIT
    this.cacheLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : DEFAULT_CACHE_LIMIT

    this.state = this.emptyState(null)
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
      this.applyEntry(trackId, cached)
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
      expectedSidecarName: '',
      translation: this.emptyTranslation()
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
      this.applyEntry(trackId, cached)
      this.persistChoice(trackId, null)
      return
    }

    const target = cached.entries.find((entry) => entry.option.id === sourceId)
    if (!target || !target.usable) return

    cached.savedChoice = sourceId
    this.applyEntry(trackId, cached)
    this.persistChoice(trackId, sourceId)
  }

  /** Toggle the translation layer and persist the new value. */
  setTranslationEnabled(enabled: boolean, options: SetPreferenceOptions = {}): void {
    this.applyTranslationSettings(
      { enabled, language: this.translationLanguage },
      options
    )
  }

  /** Apply toggle and sticky language together, e.g. at startup with `{ persist: false }`. */
  applyTranslationSettings(
    input: TranslationSettingsInput,
    options: SetPreferenceOptions = {}
  ): void {
    this.translationEnabled = input.enabled
    this.translationLanguage = input.language
    if (options.persist !== false) this.persistTranslationSettings()

    const trackId = this.state.trackId
    const cached = trackId ? this.cache.get(trackId) : null
    if (trackId && cached) {
      this.applyEntry(trackId, cached)
      return
    }

    this.setState({ ...this.state, translation: this.emptyTranslation() })
  }

  /**
   * Selects the translation source for the current track. Null returns to auto-selection.
   * A variant option also updates the sticky language used for other tracks.
   */
  selectTranslation(sourceId: string | null): void {
    const trackId = this.state.trackId
    if (!trackId) return

    const cached = this.cache.get(trackId)
    if (!cached) return

    if (sourceId === null) {
      cached.savedTranslationChoice = null
      this.applyEntry(trackId, cached)
      this.persistTranslationChoice(trackId, null)
      return
    }

    const candidate = this.state.translation.options.find(
      (option) => option.option.id === sourceId && option.eligible
    )
    if (!candidate) return

    cached.savedTranslationChoice = sourceId
    if (candidate.option.variant) {
      this.translationLanguage = candidate.option.variant
      this.persistTranslationSettings()
    }
    this.applyEntry(trackId, cached)
    this.persistTranslationChoice(trackId, sourceId)
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
      this.applyEntry(trackId, cached)
      return
    }

    this.setState({ ...this.state, preference })
  }

  /** Bypass the cache and refetch the current track, keeping its saved choice. */
  reload(): void {
    const trackId = this.state.trackId
    if (!trackId) return

    const generation = ++this.requestGeneration
    const cached = this.cache.get(trackId)
    const savedChoice = cached?.savedChoice ?? null
    const savedTranslationChoice = cached?.savedTranslationChoice ?? null
    this.cache.delete(trackId)

    this.setState({ ...this.state, status: 'loading', doc: null })
    void this.load(trackId, generation, savedChoice, savedTranslationChoice)
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
    const savedTranslationChoice = cached ? cached.savedTranslationChoice : undefined
    const generation = ++this.requestGeneration
    this.cache.clear()

    this.setState({ ...this.state, status: 'loading', doc: null })
    void this.load(trackId, generation, savedChoice, savedTranslationChoice)
  }

  private async load(
    trackId: string,
    generation: number,
    savedChoiceOverride?: string | null,
    savedTranslationChoiceOverride?: string | null
  ): Promise<void> {
    try {
      const response = await this.deps.fetchSources(trackId)
      if (generation !== this.requestGeneration) return

      const cached = response
        ? this.buildCached(response)
        : {
            entries: [],
            expectedSidecarName: '',
            savedChoice: null,
            savedTranslationChoice: null
          }

      cached.savedChoice =
        savedChoiceOverride !== undefined ? savedChoiceOverride : cached.savedChoice
      cached.savedTranslationChoice =
        savedTranslationChoiceOverride !== undefined
          ? savedTranslationChoiceOverride
          : cached.savedTranslationChoice

      this.remember(trackId, cached)
      this.applyEntry(trackId, cached)
      this.logSources(trackId, cached)
    } catch (error) {
      if (generation !== this.requestGeneration) return

      console.error(`[lyrics] Could not load lyric sources for ${trackId}`, error)
      const cached: CachedSources = {
        entries: [],
        expectedSidecarName: '',
        savedChoice: savedChoiceOverride !== undefined ? savedChoiceOverride : null,
        savedTranslationChoice:
          savedTranslationChoiceOverride !== undefined ? savedTranslationChoiceOverride : null
      }
      this.remember(trackId, cached)
      this.applyEntry(trackId, cached)
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
      savedChoice: response.savedChoice,
      savedTranslationChoice: response.savedTranslationChoice
    }
  }

  private applyEntry(trackId: string, cached: CachedSources): void {
    const selection = selectLyricSource(
      cached.entries.map((entry) => entry.option),
      {
        savedChoice: cached.savedChoice,
        preference: this.preference,
        isUsable: (option) =>
          cached.entries.find((entry) => entry.option.id === option.id)?.usable === true
      }
    )

    const selected = selection
      ? (cached.entries.find((entry) => entry.option.id === selection.option.id) ?? null)
      : null
    const usableSelected = selected?.usable === true ? selected : null
    const primaryDoc = usableSelected?.doc ?? null

    const translation = buildTranslation({
      enabled: this.translationEnabled,
      language: this.translationLanguage,
      primaryId: usableSelected?.option.id ?? null,
      primaryDoc,
      savedChoice: cached.savedTranslationChoice,
      entries: cached.entries
    })

    const previousTranslation = this.state.translation
    this.setState({
      status: usableSelected ? 'ready' : 'none',
      doc: translation.doc,
      trackId,
      sources: cached.entries,
      selectedId: usableSelected?.option.id ?? null,
      mode: usableSelected ? (selection?.mode ?? null) : null,
      preference: this.preference,
      expectedSidecarName: cached.expectedSidecarName,
      translation: translation.state
    })

    if (!sameTranslation(previousTranslation, translation.state)) {
      this.logTranslation(translation.state)
    }
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
      expectedSidecarName: '',
      translation: this.emptyTranslation()
    }
  }

  private emptyTranslation(): TranslationState {
    return buildTranslation({
      enabled: this.translationEnabled,
      language: this.translationLanguage,
      primaryId: null,
      primaryDoc: null,
      savedChoice: null,
      entries: []
    }).state
  }

  private persistChoice(trackId: string, sourceId: string | null): void {
    void this.deps
      .saveChoice(trackId, sourceId)
      .catch((error) => console.error('[lyrics] Could not save the lyric choice', error))
  }

  private persistTranslationChoice(trackId: string, sourceId: string | null): void {
    void this.deps
      .saveTranslationChoice(trackId, sourceId)
      .catch((error) => console.error('[lyrics] Could not save the translation choice', error))
  }

  private persistTranslationSettings(): void {
    void this.deps
      .saveTranslationSettings({
        enabled: this.translationEnabled,
        language: this.translationLanguage
      })
      .catch((error) => console.error('[lyrics] Could not save translation settings', error))
  }

  private logTranslation(translation: TranslationState): void {
    const report =
      translation.options.find((option) => option.option.id === translation.selectedId)?.report ??
      null
    console.debug('[lyrics] translation', {
      selectedId: translation.selectedId,
      mode: translation.mode,
      report
    })
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
      next.expectedSidecarName === this.state.expectedSidecarName &&
      sameTranslation(next.translation, this.state.translation)
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

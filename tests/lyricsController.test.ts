import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LyricsController } from '../src/renderer/lyrics/lyricsController'
import type { LyricsState } from '../src/renderer/lyrics/lyricsController'
import type {
  LyricPreference,
  LyricSourceOption,
  LyricSources
} from '../src/shared/lyrics/sources'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function lyricText(label: string): string {
  return `[00:01.00]${label}`
}

function option(
  id: string,
  kind: 'embedded' | 'sidecar',
  text: string | null,
  available = text !== null
): LyricSourceOption {
  return {
    id,
    kind,
    label: kind === 'embedded' ? 'Embedded tag' : 'Sidecar file',
    detail: kind === 'embedded' ? 'common.lyrics' : id.slice('sidecar:'.length),
    available,
    text,
    variant: null
  }
}

function sources(
  trackId: string,
  options: LyricSourceOption[],
  savedChoice: string | null = null,
  preference: LyricPreference = 'sidecar',
  savedTranslationChoice: string | null = null
): LyricSources {
  return {
    trackId,
    options,
    savedChoice,
    savedTranslationChoice,
    preference,
    expectedSidecarName: `${trackId}.lrc`
  }
}

function embedded(trackId: string, text: string | null = lyricText('embedded')) {
  return option('embedded', 'embedded', text)
}

function exact(trackId: string, text: string | null = lyricText('sidecar')) {
  return option(`sidecar:${trackId}.lrc`, 'sidecar', text)
}

function variant(trackId: string, name: string, text: string | null = lyricText(name)) {
  return { ...option(`sidecar:${trackId}.${name}.lrc`, 'sidecar', text), variant: name }
}

function createController(
  fetchSources: (trackId: string) => Promise<LyricSources | null>,
  preference: LyricPreference = 'sidecar',
  cacheLimit?: number,
  translation: { enabled: boolean; language: string | null } = {
    enabled: false,
    language: null
  }
) {
  const saveChoice = vi.fn(async () => undefined)
  const savePreference = vi.fn(async () => undefined)
  const saveTranslationChoice = vi.fn(async () => undefined)
  const saveTranslationSettings = vi.fn(async () => undefined)
  const controller = new LyricsController({
    fetchSources,
    saveChoice,
    savePreference,
    saveTranslationChoice,
    saveTranslationSettings,
    preference,
    translationEnabled: translation.enabled,
    translationLanguage: translation.language,
    cacheLimit
  })

  return {
    controller,
    saveChoice,
    savePreference,
    saveTranslationChoice,
    saveTranslationSettings
  }
}

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LyricsController', () => {
  it('selects the exact sidecar by default and exposes every parsed source', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId), variant(trackId, 'en')])
    )
    const { controller } = createController(fetchSources)

    controller.setTrack('a')
    await flush()

    const state = controller.getState()
    expect(state).toMatchObject({
      status: 'ready',
      trackId: 'a',
      selectedId: 'sidecar:a.lrc',
      mode: 'auto',
      preference: 'sidecar',
      expectedSidecarName: 'a.lrc'
    })
    expect(state.doc?.lines[0]?.text).toBe('sidecar')
    expect(state.sources).toHaveLength(3)
    expect(state.sources.map((entry) => entry.usable)).toEqual([true, true, true])
    expect(state.sources[1]).toMatchObject({
      format: 'lrc',
      lineCount: 1,
      warningCount: 0
    })
  })

  it('uses the embedded tag when the preference is embedded', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId)], null, 'embedded')
    )
    const { controller } = createController(fetchSources, 'embedded')

    controller.setTrack('a')
    await flush()

    expect(controller.getState()).toMatchObject({
      selectedId: 'embedded',
      mode: 'auto',
      preference: 'embedded'
    })
    expect(controller.getState().doc?.lines[0]?.text).toBe('embedded')
  })

  it('honors a saved choice and marks the selection as saved', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(
        trackId,
        [embedded(trackId), exact(trackId), variant(trackId, 'en')],
        'sidecar:a.en.lrc'
      )
    )
    const { controller, saveChoice } = createController(fetchSources)

    controller.setTrack('a')
    await flush()

    expect(controller.getState()).toMatchObject({
      selectedId: 'sidecar:a.en.lrc',
      mode: 'saved'
    })
    expect(controller.getState().doc?.lines[0]?.text).toBe('en')
    expect(saveChoice).not.toHaveBeenCalled()
  })

  it('falls back to auto when the saved choice no longer exists', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId)], 'sidecar:a.gone.lrc')
    )
    const { controller } = createController(fetchSources)

    controller.setTrack('a')
    await flush()

    expect(controller.getState()).toMatchObject({
      selectedId: 'sidecar:a.lrc',
      mode: 'auto'
    })
  })

  it('skips an available source that does not parse into a line', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId, '   '), variant(trackId, 'en')])
    )
    const { controller } = createController(fetchSources)

    controller.setTrack('a')
    await flush()

    const state = controller.getState()
    expect(state).toMatchObject({ selectedId: 'embedded', mode: 'auto', status: 'ready' })
    expect(state.sources[1]).toMatchObject({ usable: false, lineCount: 0 })
    expect(state.sources[1]?.doc?.lines).toEqual([])
  })

  it('reports none when no source is usable but still exposes the sources', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId, '   '), exact(trackId, '')])
    )
    const { controller } = createController(fetchSources)

    controller.setTrack('a')
    await flush()

    expect(controller.getState()).toMatchObject({
      status: 'none',
      doc: null,
      trackId: 'a',
      selectedId: null,
      mode: null
    })
    expect(controller.getState().sources).toHaveLength(2)
  })

  it('switches manually without refetching and persists the choice', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId), variant(trackId, 'en')])
    )
    const { controller, saveChoice } = createController(fetchSources)

    controller.setTrack('a')
    await flush()
    expect(fetchSources).toHaveBeenCalledTimes(1)

    controller.selectSource('embedded')

    expect(controller.getState()).toMatchObject({
      selectedId: 'embedded',
      mode: 'saved'
    })
    expect(controller.getState().doc?.lines[0]?.text).toBe('embedded')
    expect(saveChoice).toHaveBeenCalledWith('a', 'embedded')
    expect(fetchSources).toHaveBeenCalledTimes(1)

    controller.selectSource('sidecar:a.en.lrc')

    expect(controller.getState()).toMatchObject({
      selectedId: 'sidecar:a.en.lrc',
      mode: 'saved'
    })
    expect(saveChoice).toHaveBeenLastCalledWith('a', 'sidecar:a.en.lrc')
    expect(fetchSources).toHaveBeenCalledTimes(1)
  })

  it('ignores a manual switch to an unavailable or unusable source', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId, '   '), variant(trackId, 'en', null)])
    )
    const { controller, saveChoice } = createController(fetchSources)

    controller.setTrack('a')
    await flush()

    controller.selectSource('sidecar:a.lrc')
    controller.selectSource('sidecar:a.en.lrc')
    controller.selectSource('sidecar:a.missing.lrc')

    expect(controller.getState().selectedId).toBe('embedded')
    expect(saveChoice).not.toHaveBeenCalled()
  })

  it('clears the saved choice and returns to auto', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId)], 'embedded')
    )
    const { controller, saveChoice } = createController(fetchSources)

    controller.setTrack('a')
    await flush()
    expect(controller.getState()).toMatchObject({ selectedId: 'embedded', mode: 'saved' })

    controller.selectSource(null)

    expect(controller.getState()).toMatchObject({
      selectedId: 'sidecar:a.lrc',
      mode: 'auto'
    })
    expect(saveChoice).toHaveBeenCalledWith('a', null)
  })

  it('persists a preference change and recomputes without refetching', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId)])
    )
    const { controller, savePreference } = createController(fetchSources)

    controller.setTrack('a')
    await flush()
    expect(controller.getState().selectedId).toBe('sidecar:a.lrc')

    controller.setPreference('embedded')

    expect(savePreference).toHaveBeenCalledWith('embedded')
    expect(controller.getState()).toMatchObject({
      selectedId: 'embedded',
      mode: 'auto',
      preference: 'embedded'
    })
    expect(fetchSources).toHaveBeenCalledTimes(1)

    controller.setPreference('sidecar', { persist: false })

    expect(savePreference).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toMatchObject({
      selectedId: 'sidecar:a.lrc',
      preference: 'sidecar'
    })
  })

  it('reloads from main and keeps the saved choice', async () => {
    let calls = 0
    const fetchSources = vi.fn(async (trackId: string) => {
      calls += 1
      return sources(
        trackId,
        [embedded(trackId, lyricText(calls === 1 ? 'old' : 'new')), exact(trackId)],
        'embedded'
      )
    })
    const { controller, saveChoice } = createController(fetchSources)

    controller.setTrack('a')
    await flush()
    expect(controller.getState().doc?.lines[0]?.text).toBe('old')
    expect(controller.getState()).toMatchObject({ selectedId: 'embedded', mode: 'saved' })

    controller.reload()
    expect(controller.getState()).toMatchObject({ status: 'loading', trackId: 'a' })

    await flush()

    expect(fetchSources).toHaveBeenCalledTimes(2)
    expect(controller.getState()).toMatchObject({
      status: 'ready',
      selectedId: 'embedded',
      mode: 'saved'
    })
    expect(controller.getState().doc?.lines[0]?.text).toBe('new')
    expect(saveChoice).not.toHaveBeenCalled()
  })

  it('ignores a response for a track that is no longer current', async () => {
    const pending = new Map<string, Deferred<LyricSources | null>>()
    const fetchSources = vi.fn((trackId: string) => {
      const request = deferred<LyricSources | null>()
      pending.set(trackId, request)
      return request.promise
    })
    const { controller } = createController(fetchSources)

    controller.setTrack('a')
    expect(controller.getState()).toMatchObject({ status: 'loading', trackId: 'a' })

    controller.setTrack('b')
    expect(controller.getState()).toMatchObject({ status: 'loading', trackId: 'b' })

    pending.get('a')?.resolve(sources('a', [embedded('a'), exact('a')]))
    await flush()

    expect(controller.getState()).toMatchObject({ status: 'loading', trackId: 'b' })

    pending.get('b')?.resolve(sources('b', [embedded('b'), exact('b')]))
    await flush()

    expect(controller.getState()).toMatchObject({ status: 'ready', trackId: 'b' })
    expect(controller.getState().doc?.lines[0]?.text).toBe('sidecar')
  })

  it('reuses cached source entries and evicts the least recently used', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId)], null, 'embedded')
    )
    const { controller } = createController(fetchSources, 'embedded', 2)

    controller.setTrack('a')
    await flush()
    controller.setTrack('b')
    await flush()
    controller.setTrack('a')
    expect(fetchSources).toHaveBeenCalledTimes(2)

    controller.setTrack('c')
    await flush()
    expect(fetchSources).toHaveBeenCalledTimes(3)

    // "a" was refreshed before "c", so "b" is the evicted entry.
    controller.setTrack('b')
    await flush()
    expect(fetchSources).toHaveBeenCalledTimes(4)

    // "c" is still cached after "b" replaced "a".
    controller.setTrack('c')
    expect(controller.getState().status).toBe('ready')
    expect(fetchSources).toHaveBeenCalledTimes(4)

    controller.setTrack('a')
    await flush()
    expect(fetchSources).toHaveBeenCalledTimes(5)
  })

  it('caches a null response and reports the none state', async () => {
    const fetchSources = vi.fn(async () => null)
    const { controller } = createController(fetchSources)

    controller.setTrack('a')
    await flush()

    expect(controller.getState()).toMatchObject({
      status: 'none',
      doc: null,
      trackId: 'a',
      sources: [],
      selectedId: null,
      mode: null,
      expectedSidecarName: ''
    })

    controller.setTrack('b')
    await flush()
    controller.setTrack('a')

    expect(controller.getState().status).toBe('none')
    expect(fetchSources).toHaveBeenCalledTimes(2)
  })

  it('emits the current state immediately to a subscriber', () => {
    const { controller } = createController(async () => null)
    const listener = vi.fn<(state: LyricsState) => void>()

    const unsubscribe = controller.subscribe(listener)

    expect(listener).toHaveBeenCalledWith(controller.getState())

    unsubscribe()
    controller.setTrack('a')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears state when the track is reset', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId)])
    )
    const { controller } = createController(fetchSources)

    controller.setTrack('a')
    await flush()
    controller.setTrack(null)

    expect(controller.getState()).toMatchObject({
      status: 'none',
      doc: null,
      trackId: null,
      sources: [],
      selectedId: null,
      mode: null
    })
  })
})

describe('LyricsController translation layer', () => {
  function translationSources(trackId: string, savedTranslationChoice: string | null = null) {
    return sources(
      trackId,
      [embedded(trackId), exact(trackId), variant(trackId, 'en'), variant(trackId, 'ja')],
      null,
      'sidecar',
      savedTranslationChoice
    )
  }

  it('reports eligibility and alignment while leaving the document plain when disabled', async () => {
    const fetchSources = vi.fn(async (trackId: string) => translationSources(trackId))
    const { controller } = createController(fetchSources, 'sidecar', undefined, {
      enabled: false,
      language: 'en'
    })

    controller.setTrack('a')
    await flush()

    const state = controller.getState()
    expect(state.translation).toMatchObject({
      enabled: false,
      language: 'en',
      selectedId: 'sidecar:a.en.lrc',
      mode: 'auto',
      key: null,
      available: true
    })
    expect(state.translation.options.map((option) => [option.option.id, option.eligible])).toEqual([
      ['embedded', true],
      ['sidecar:a.lrc', false],
      ['sidecar:a.en.lrc', true],
      ['sidecar:a.ja.lrc', true]
    ])
    expect(state.translation.options[1].reason).toBe('primary')
    expect(state.translation.options[2].report).toMatchObject({ method: 'time', matched: 1 })
    expect(state.doc?.lines[0]?.translations).toBeUndefined()
  })

  it('attaches and detaches the selected translation', async () => {
    const fetchSources = vi.fn(async (trackId: string) => translationSources(trackId))
    const { controller, saveTranslationSettings } = createController(
      fetchSources,
      'sidecar',
      undefined,
      { enabled: false, language: 'en' }
    )

    controller.setTrack('a')
    await flush()

    controller.setTranslationEnabled(true)

    expect(saveTranslationSettings).toHaveBeenCalledWith({ enabled: true, language: 'en' })
    expect(controller.getState().translation).toMatchObject({
      enabled: true,
      selectedId: 'sidecar:a.en.lrc',
      key: 'sidecar:a.en.lrc'
    })
    expect(controller.getState().doc?.lines[0]?.translations).toEqual({
      'sidecar:a.en.lrc': 'en'
    })

    controller.setTranslationEnabled(false)

    expect(controller.getState().translation.key).toBeNull()
    expect(controller.getState().doc?.lines[0]?.translations).toBeUndefined()
  })

  it('uses a saved translation choice and persists sticky language on manual selection', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      translationSources(trackId, 'sidecar:a.ja.lrc')
    )
    const { controller, saveTranslationChoice, saveTranslationSettings } = createController(
      fetchSources,
      'sidecar',
      undefined,
      { enabled: true, language: 'en' }
    )

    controller.setTrack('a')
    await flush()

    expect(controller.getState().translation).toMatchObject({
      selectedId: 'sidecar:a.ja.lrc',
      mode: 'saved',
      key: 'sidecar:a.ja.lrc'
    })

    controller.selectTranslation('sidecar:a.en.lrc')

    expect(saveTranslationChoice).toHaveBeenCalledWith('a', 'sidecar:a.en.lrc')
    expect(saveTranslationSettings).toHaveBeenCalledWith({ enabled: true, language: 'en' })
    expect(controller.getState().translation).toMatchObject({
      selectedId: 'sidecar:a.en.lrc',
      mode: 'saved',
      language: 'en'
    })

    controller.selectTranslation(null)

    expect(saveTranslationChoice).toHaveBeenLastCalledWith('a', null)
    expect(controller.getState().translation).toMatchObject({
      selectedId: 'sidecar:a.en.lrc',
      mode: 'auto',
      language: 'en'
    })
  })

  it('ignores a translation that is primary, unavailable, or unusable', async () => {
    const fetchSources = vi.fn(async (trackId: string) => translationSources(trackId))
    const { controller, saveTranslationChoice } = createController(
      fetchSources,
      'sidecar',
      undefined,
      { enabled: true, language: 'en' }
    )

    controller.setTrack('a')
    await flush()

    controller.selectTranslation('sidecar:a.lrc')
    controller.selectTranslation('sidecar:a.missing.lrc')

    expect(saveTranslationChoice).not.toHaveBeenCalled()
    expect(controller.getState().translation.selectedId).toBe('sidecar:a.en.lrc')
  })

  it('keeps an ineligible saved translation and restores it when it becomes eligible again', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      translationSources(trackId, 'embedded')
    )
    const { controller } = createController(fetchSources, 'sidecar', undefined, {
      enabled: true,
      language: 'en'
    })

    controller.setTrack('a')
    await flush()
    expect(controller.getState().translation).toMatchObject({
      selectedId: 'embedded',
      mode: 'saved'
    })

    controller.selectSource('embedded')

    expect(controller.getState().translation).toMatchObject({
      selectedId: 'sidecar:a.en.lrc',
      mode: 'auto'
    })

    controller.selectSource('sidecar:a.lrc')

    expect(controller.getState().translation).toMatchObject({
      selectedId: 'embedded',
      mode: 'saved'
    })
  })

  it('preserves both saved choices across reload', async () => {
    const fetchSources = vi.fn(async (trackId: string) =>
      sources(trackId, [embedded(trackId), exact(trackId), variant(trackId, 'en')], null, 'sidecar')
    )
    const { controller } = createController(fetchSources, 'sidecar', undefined, {
      enabled: true,
      language: null
    })

    controller.setTrack('a')
    await flush()
    controller.selectSource('embedded')
    controller.selectTranslation('sidecar:a.en.lrc')

    controller.reload()
    await flush()

    const state = controller.getState()
    expect(state).toMatchObject({ selectedId: 'embedded', mode: 'saved' })
    expect(state.translation).toMatchObject({
      selectedId: 'sidecar:a.en.lrc',
      mode: 'saved',
      key: 'sidecar:a.en.lrc'
    })
  })
})

import { describe, expect, it } from 'vitest'
import type { AlignmentReport, LyricDocument, LyricFormat, LyricLine } from '../src/shared/lyrics'
import type { LyricPreference, LyricSourceOption } from '../src/shared/lyrics/sources'
import type { LyricsSourceEntry, LyricsState } from '../src/renderer/lyrics/lyricsController'
import type {
  TranslationOptionState,
  TranslationState
} from '../src/renderer/lyrics/translationState'
import {
  buildSourceMenuModel,
  firstEnabledIndex,
  lastEnabledIndex,
  nextEnabledIndex
} from '../src/renderer/lyrics/sourceMenuModel'

function line(index: number, agent?: string): LyricLine {
  return {
    index,
    start: index,
    end: index + 1,
    endIsEstimated: true,
    text: `line ${index}`,
    ...(agent === undefined ? {} : { agent })
  }
}

function document(format: LyricFormat, lines: LyricLine[], warnings: string[] = []): LyricDocument {
  return {
    format,
    timed: format !== 'plain',
    metadata: { raw: {} },
    lines,
    warnings
  }
}

function option(
  id: string,
  kind: 'embedded' | 'sidecar',
  label: string,
  detail: string | null,
  available = true
): LyricSourceOption {
  return { id, kind, label, detail, available, text: available ? 'text' : null, variant: null }
}

function entry(source: LyricSourceOption, doc: LyricDocument | null): LyricsSourceEntry {
  return {
    option: source,
    doc,
    format: doc?.format ?? null,
    lineCount: doc?.lines.length ?? 0,
    warningCount: doc?.warnings.length ?? 0,
    usable: doc !== null && doc.lines.length > 0
  }
}

function state(overrides: Partial<LyricsState> = {}): LyricsState {
  return {
    status: 'ready',
    doc: null,
    trackId: 'track-1',
    sources: [],
    selectedId: null,
    mode: null,
    preference: 'sidecar',
    expectedSidecarName: 'Song.lrc',
    translation: {
      enabled: false,
      language: null,
      selectedId: null,
      mode: null,
      key: null,
      available: false,
      options: []
    },
    ...overrides
  }
}

function translationState(overrides: Partial<TranslationState> = {}): TranslationState {
  return {
    enabled: false,
    language: null,
    selectedId: null,
    mode: null,
    key: null,
    available: false,
    options: [],
    ...overrides
  }
}

function translationOption(
  source: LyricSourceOption,
  eligible: boolean,
  reason: TranslationOptionState['reason'],
  report: AlignmentReport | null = null
): TranslationOptionState {
  return { option: source, eligible, reason, report }
}

function withVariant(source: LyricSourceOption, variant: string): LyricSourceOption {
  return { ...source, variant }
}

function report(
  method: AlignmentReport['method'],
  matched: number,
  total: number
): AlignmentReport {
  return { method, matched, total, unmatchedTranslationLines: 0 }
}

const embeddedOption = option('embedded', 'embedded', 'Embedded tag', 'LYRICS')
const exactOption = option('sidecar:Song.lrc', 'sidecar', 'Sidecar file', 'Song.lrc')
const variantOption = option('sidecar:Song.en.lrc', 'sidecar', 'Sidecar (en)', 'Song.en.lrc')

describe('buildSourceMenuModel', () => {
  it('describes an automatic embedded selection with badges and an Auto tag', () => {
    const doc = document('enhanced-lrc', [line(0, 'v1'), line(1, 'v2')])
    const model = buildSourceMenuModel(
      state({
        sources: [entry(embeddedOption, doc)],
        selectedId: 'embedded',
        mode: 'auto'
      })
    )

    expect(model.trigger).toEqual({
      label: 'Lyrics: Embedded tag',
      autoTag: 'Auto',
      loading: false,
      disabled: false
    })
    expect(model.autoRow).toEqual({
      label: 'Auto',
      detail: 'Using: Embedded tag',
      checked: true
    })
    expect(model.rows[0]).toMatchObject({
      id: 'embedded',
      label: 'Embedded tag',
      detail: 'LYRICS',
      checked: false,
      inUse: true,
      disabled: false,
      reason: null
    })
    expect(model.rows[0]?.badges.map((badge) => badge.text)).toEqual([
      'Word-timed',
      '2 lines',
      'Singers'
    ])
  })

  it('marks a saved sidecar choice and leaves Auto unchecked', () => {
    const model = buildSourceMenuModel(
      state({
        sources: [
          entry(embeddedOption, document('lrc', [line(0)])),
          entry(exactOption, document('lrc', [line(0)]))
        ],
        selectedId: 'sidecar:Song.lrc',
        mode: 'saved'
      })
    )

    expect(model.trigger).toMatchObject({
      label: 'Lyrics: Sidecar file',
      autoTag: null
    })
    expect(model.autoRow.checked).toBe(false)
    expect(model.rows[0]).toMatchObject({ checked: false, inUse: false })
    expect(model.rows[1]).toMatchObject({ checked: true, inUse: true })
  })

  it('keeps canonical order for embedded, exact, and variant sidecars', () => {
    const model = buildSourceMenuModel(
      state({
        sources: [
          entry(embeddedOption, document('lrc', [line(0)])),
          entry(exactOption, document('lrc', [line(0)])),
          entry(variantOption, document('lrc', [line(0)]))
        ],
        selectedId: 'sidecar:Song.lrc',
        mode: 'auto'
      })
    )

    expect(model.rows.map((row) => row.label)).toEqual([
      'Embedded tag',
      'Sidecar file',
      'Sidecar (en)'
    ])
    expect(model.rows[2]?.detail).toBe('Song.en.lrc')
  })

  it('reports nothing usable and still exposes every row with a reason', () => {
    const model = buildSourceMenuModel(
      state({
        status: 'none',
        sources: [
          entry(option('embedded', 'embedded', 'Embedded tag', null, false), null),
          entry(option('sidecar:Song.lrc', 'sidecar', 'Sidecar file', null, false), null)
        ],
        selectedId: null,
        mode: null
      })
    )

    expect(model.trigger).toMatchObject({ label: 'No lyrics', autoTag: null })
    expect(model.autoRow.checked).toBe(true)
    expect(model.rows.map((row) => row.disabled)).toEqual([true, true])
    expect(model.rows.map((row) => row.reason)).toEqual([
      "No lyrics in this file's tags",
      'No "Song.lrc" next to this track'
    ])
    expect(model.emptyState).toEqual({
      message: 'No lyrics found',
      hint: 'Add a lyrics file named "Song.lrc" next to the track, then choose Reload sources.',
      text: 'No lyrics found\nAdd a lyrics file named "Song.lrc" next to the track, then choose Reload sources.'
    })
  })

  it('uses the unreadable reason for an available source with no lines', () => {
    const model = buildSourceMenuModel(
      state({
        status: 'none',
        sources: [entry(embeddedOption, document('lrc', []))],
        selectedId: null,
        mode: null
      })
    )

    expect(model.rows[0]).toMatchObject({
      disabled: true,
      reason: "Couldn't read any lyric lines"
    })
  })

  it('shows loading labels and disables the chip and reload action', () => {
    const model = buildSourceMenuModel(
      state({
        status: 'loading',
        sources: [],
        selectedId: null,
        mode: null
      })
    )

    expect(model.trigger).toEqual({
      label: 'Loading…',
      autoTag: null,
      loading: true,
      disabled: true
    })
    expect(model.autoRow.detail).toBe('Using: Loading…')
    expect(model.reload).toEqual({ label: 'Reloading…', disabled: true })
    expect(model.loadingMessage).toBe('Loading lyrics…')
  })

  it('uses a generic empty-state hint when the sidecar name is unknown', () => {
    const model = buildSourceMenuModel(
      state({
        status: 'none',
        expectedSidecarName: ''
      })
    )

    expect(model.emptyState.hint).toBe(
      'Add a lyrics file next to the track, then choose Reload sources.'
    )
    expect(model.emptyState.text).toBe(
      'No lyrics found\nAdd a lyrics file next to the track, then choose Reload sources.'
    )
  })

  it('adds a warning badge with the parser warnings as its tooltip', () => {
    const doc = document('lrc', [line(0)], ['Skipped 3 invalid lines', 'Bad timestamp'])
    const model = buildSourceMenuModel(
      state({
        sources: [entry(exactOption, doc)],
        selectedId: 'sidecar:Song.lrc',
        mode: 'auto'
      })
    )

    expect(model.rows[0]?.badges).toContainEqual({
      text: '2 warnings',
      title: 'Skipped 3 invalid lines\nBad timestamp',
      tone: 'warning'
    })
  })

  it('uses singular line and warning labels', () => {
    const doc = document('lrc', [line(0)], ['Only one warning'])
    const model = buildSourceMenuModel(
      state({
        sources: [entry(exactOption, doc)],
        selectedId: 'sidecar:Song.lrc',
        mode: 'auto'
      })
    )

    expect(model.rows[0]?.badges.map((badge) => badge.text)).toEqual([
      'Line-timed',
      '1 line',
      '1 warning'
    ])
  })

  it.each([
    ['enhanced-lrc', 'Word-timed'],
    ['lrc', 'Line-timed'],
    ['plain', 'Unsynced']
  ] as const)('labels %s as %s', (format, label) => {
    const model = buildSourceMenuModel(
      state({
        sources: [entry(exactOption, document(format, [line(0)]))],
        selectedId: 'sidecar:Song.lrc',
        mode: 'auto'
      })
    )

    expect(model.rows[0]?.badges[0]).toEqual({ text: label, tone: 'muted' })
  })

  it('counts many lines with a plural label', () => {
    const lines = Array.from({ length: 42 }, (_, index) => line(index))
    const model = buildSourceMenuModel(
      state({
        sources: [entry(exactOption, document('lrc', lines))],
        selectedId: 'sidecar:Song.lrc',
        mode: 'auto'
      })
    )

    expect(model.rows[0]?.badges.map((badge) => badge.text)).toContain('42 lines')
  })

  it('exposes the preference options and their checked state', () => {
    const preference: LyricPreference = 'embedded'
    const model = buildSourceMenuModel(state({ preference }))

    expect(model.preference).toEqual({
      label: 'When both exist, prefer:',
      options: [
        { id: 'sidecar', label: 'Sidecar', checked: false },
        { id: 'embedded', label: 'Embedded', checked: true }
      ]
    })
  })
})

describe('buildSourceMenuModel translation section', () => {
  function primaryState(translation: Partial<TranslationState>): LyricsState {
    return state({
      sources: [
        entry(embeddedOption, document('lrc', [line(0)])),
        entry(exactOption, document('lrc', [line(0)]))
      ],
      selectedId: 'sidecar:Song.lrc',
      mode: 'auto',
      translation: translationState(translation)
    })
  }

  it.each([
    ['off', { enabled: false, available: true, selectedId: 'sidecar:Song.en.lrc' }, 'off'],
    ['active', { enabled: true, available: true, selectedId: 'sidecar:Song.en.lrc' }, 'active'],
    [
      'unavailable while off',
      { enabled: false, available: false, selectedId: null },
      'unavailable'
    ],
    ['unavailable while on', { enabled: true, available: false, selectedId: null }, 'unavailable'],
    ['needs a choice', { enabled: true, available: true, selectedId: null }, 'needs-choice']
  ] as const)('reports translation status %s', (_name, translation, expected) => {
    const model = buildSourceMenuModel(primaryState(translation))
    expect(model.translation.status).toBe(expected)
  })

  it('disables the switch only when translation is off and no option is eligible', () => {
    expect(
      buildSourceMenuModel(primaryState({ enabled: false, available: true })).translation.switch
        .disabled
    ).toBe(false)
    expect(
      buildSourceMenuModel(primaryState({ enabled: false, available: false })).translation.switch
        .disabled
    ).toBe(true)
    expect(
      buildSourceMenuModel(primaryState({ enabled: true, available: false })).translation.switch
        .disabled
    ).toBe(false)
  })

  it('names an example translation sidecar in the unavailable hint', () => {
    const withoutLanguage = buildSourceMenuModel(
      primaryState({ enabled: false, available: false, language: null })
    )
    expect(withoutLanguage.translation.switch.hint).toBe(
      'No translation files found. Add a file such as "Song.EN.lrc" next to the track, then choose Reload sources.'
    )

    const withLanguage = buildSourceMenuModel(
      primaryState({ enabled: false, available: false, language: 'ja' })
    )
    expect(withLanguage.translation.switch.hint).toBe(
      'No translation files found. Add a file such as "Song.ja.lrc" next to the track, then choose Reload sources.'
    )
  })

  it('asks the user to choose when eligible options exist but none is selected', () => {
    const model = buildSourceMenuModel(
      primaryState({ enabled: true, available: true, selectedId: null })
    )
    expect(model.translation.switch.hint).toBe('Choose a translation below.')
  })

  it('shows the sticky language in the translation auto row', () => {
    const en = withVariant(variantOption, 'en')
    const model = buildSourceMenuModel(
      primaryState({
        enabled: true,
        available: true,
        language: 'en',
        selectedId: 'sidecar:Song.en.lrc',
        mode: 'auto',
        options: [translationOption(en, true, null, report('time', 1, 1))]
      })
    )

    expect(model.translation.autoRow).toEqual({
      label: 'Auto',
      detail: 'Language: en',
      checked: true
    })
  })

  it('shows the selected translation when there is no sticky language', () => {
    const en = withVariant(variantOption, 'en')
    const model = buildSourceMenuModel(
      primaryState({
        enabled: true,
        available: true,
        language: null,
        selectedId: 'sidecar:Song.en.lrc',
        mode: 'saved',
        options: [translationOption(en, true, null, report('time', 1, 1))]
      })
    )

    expect(model.translation.autoRow).toEqual({
      label: 'Auto',
      detail: 'Using: Sidecar (en)',
      checked: false
    })
  })

  it('hides translation rows while translation is off', () => {
    const en = withVariant(variantOption, 'en')
    const model = buildSourceMenuModel(
      primaryState({
        enabled: false,
        available: true,
        options: [translationOption(en, true, null, report('time', 1, 1))]
      })
    )

    expect(model.translation.rows).toEqual([])
  })

  it('describes disabled translation rows with the same reasons as source rows', () => {
    const missingEmbedded = option('embedded', 'embedded', 'Embedded tag', 'LYRICS', false)
    const unusableEn = withVariant(variantOption, 'en')
    const model = buildSourceMenuModel(
      primaryState({
        enabled: true,
        available: true,
        selectedId: 'sidecar:Song.lrc',
        options: [
          translationOption(exactOption, false, 'primary'),
          translationOption(missingEmbedded, false, 'unavailable'),
          translationOption(unusableEn, false, 'unusable')
        ]
      })
    )

    expect(model.translation.rows.map((row) => row.disabled)).toEqual([true, true, true])
    expect(model.translation.rows.map((row) => row.reason)).toEqual([
      'Currently used as lyrics',
      "No lyrics in this file's tags",
      "Couldn't read any lyric lines"
    ])
  })

  it.each([
    ['time full', report('time', 34, 34), 'Matched 34/34', 'muted'],
    ['time partial', report('time', 28, 34), 'Matched 28/34', 'warning'],
    ['index', report('index', 34, 34), 'Paired by line order', 'warning'],
    ['partial', report('partial', 28, 34), 'Partial match 28/34', 'warning']
  ] as const)('builds the %s alignment badge', (_name, alignment, text, tone) => {
    const en = withVariant(variantOption, 'en')
    const model = buildSourceMenuModel(
      primaryState({
        enabled: true,
        available: true,
        selectedId: 'sidecar:Song.en.lrc',
        options: [translationOption(en, true, null, alignment)]
      })
    )

    const badge = model.translation.rows[0]?.badges.find((item) => item.text === text)
    expect(badge?.tone).toBe(tone)
    if (tone === 'warning') expect(badge?.title).toBeTruthy()
  })

  it('labels valid language variants and falls back to the raw variant', () => {
    const en = withVariant(variantOption, 'en')
    const raw = withVariant(
      option('sidecar:Song.notes.lrc', 'sidecar', 'Sidecar (notes)', 'Song.notes.lrc'),
      'not a tag'
    )
    const model = buildSourceMenuModel(
      primaryState({
        enabled: true,
        available: true,
        selectedId: 'sidecar:Song.en.lrc',
        options: [
          translationOption(en, true, null, report('time', 1, 1)),
          translationOption(raw, true, null, report('time', 1, 1))
        ]
      })
    )

    expect(model.translation.rows[0]?.badges[0]).toEqual({ text: 'English', tone: 'muted' })
    expect(model.translation.rows[1]?.badges[0]).toEqual({ text: 'not a tag', tone: 'muted' })
  })

  it('marks an active translation as pressed in the quick toggle', () => {
    const en = withVariant(variantOption, 'en')
    const model = buildSourceMenuModel(
      primaryState({
        enabled: true,
        available: true,
        selectedId: 'sidecar:Song.en.lrc',
        options: [translationOption(en, true, null, report('time', 1, 1))]
      })
    )

    expect(model.translationToggle).toEqual({
      label: 'Translation',
      pressed: true,
      disabled: false,
      tooltip: 'Hide Sidecar (en) translation'
    })
  })

  it('disables the quick toggle when no translation file exists while off', () => {
    const model = buildSourceMenuModel(primaryState({ enabled: false, available: false }))

    expect(model.translationToggle).toMatchObject({
      pressed: false,
      disabled: true,
      tooltip: 'No translation files found'
    })
  })

  it('disables the quick toggle while loading or when there are no lyrics', () => {
    const loading = buildSourceMenuModel(
      state({
        status: 'loading',
        translation: translationState({ enabled: false, available: true })
      })
    )
    expect(loading.translationToggle).toMatchObject({
      disabled: true,
      tooltip: 'Loading lyrics…'
    })

    const none = buildSourceMenuModel(
      state({
        status: 'none',
        translation: translationState({
          enabled: true,
          available: true,
          selectedId: 'sidecar:Song.en.lrc'
        })
      })
    )
    expect(none.translationToggle).toMatchObject({
      disabled: true,
      tooltip: 'No lyrics to translate'
    })
  })

  it('keeps the quick toggle operable when off with an eligible option', () => {
    const model = buildSourceMenuModel(primaryState({ enabled: false, available: true }))

    expect(model.translationToggle).toMatchObject({ pressed: false, disabled: false })
  })
})

describe('menu keyboard navigation helpers', () => {
  it('moves forward, skips disabled rows, and wraps', () => {
    const enabled = [true, false, true, false]

    expect(nextEnabledIndex(enabled, 0, 1)).toBe(2)
    expect(nextEnabledIndex(enabled, 2, 1)).toBe(0)
  })

  it('moves backward, skips disabled rows, and wraps', () => {
    const enabled = [true, false, true, false]

    expect(nextEnabledIndex(enabled, 2, -1)).toBe(0)
    expect(nextEnabledIndex(enabled, 0, -1)).toBe(2)
  })

  it('starts at the first or last enabled row when nothing is focused', () => {
    const enabled = [false, true, false, true]

    expect(nextEnabledIndex(enabled, -1, 1)).toBe(1)
    expect(nextEnabledIndex(enabled, -1, -1)).toBe(3)
  })

  it('returns -1 when no row is enabled', () => {
    expect(nextEnabledIndex([], 0, 1)).toBe(-1)
    expect(nextEnabledIndex([false, false], 0, 1)).toBe(-1)
    expect(firstEnabledIndex([false, false])).toBe(-1)
    expect(lastEnabledIndex([false, false])).toBe(-1)
  })

  it('finds the first and last enabled indexes', () => {
    const enabled = [false, true, true, false]

    expect(firstEnabledIndex(enabled)).toBe(1)
    expect(lastEnabledIndex(enabled)).toBe(2)
  })

  it('navigates source, preference, translation, and reload rows together', () => {
    // auto, source, preference, disabled translation switch, translation auto,
    // enabled translation, disabled translation, reload
    const enabled = [true, true, true, false, true, true, false, true]

    expect(nextEnabledIndex(enabled, 2, 1)).toBe(4)
    expect(nextEnabledIndex(enabled, 4, 1)).toBe(5)
    expect(nextEnabledIndex(enabled, 5, 1)).toBe(7)
    expect(nextEnabledIndex(enabled, 7, 1)).toBe(0)
    expect(nextEnabledIndex(enabled, 4, -1)).toBe(2)
  })
})

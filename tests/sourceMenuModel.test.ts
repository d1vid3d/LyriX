import { describe, expect, it } from 'vitest'
import type { LyricDocument, LyricFormat, LyricLine } from '../src/shared/lyrics'
import type { LyricPreference, LyricSourceOption } from '../src/shared/lyrics/sources'
import type { LyricsSourceEntry, LyricsState } from '../src/renderer/lyrics/lyricsController'
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

function document(
  format: LyricFormat,
  lines: LyricLine[],
  warnings: string[] = []
): LyricDocument {
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
      text:
        'No lyrics found\nAdd a lyrics file named "Song.lrc" next to the track, then choose Reload sources.'
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
})

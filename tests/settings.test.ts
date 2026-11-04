import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clampVolume, loadSettings, saveSettings } from '../src/main/settings'
import type { Settings } from '../src/shared/types'

const DEFAULTS: Settings = {
  lastFolder: null,
  volume: 1,
  lastView: 'albums',
  sortByView: {},
  lyricPreference: 'sidecar'
}

let directory = ''

function settingsPath(): string {
  return join(directory, 'settings.json')
}

async function writeJson(value: unknown): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(value), 'utf8')
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lyrix-settings-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('clampVolume', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [2, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [Number.NEGATIVE_INFINITY, 1]
  ] as Array<[number, number]>)('clamps %s to %s', (value, expected) => {
    expect(clampVolume(value)).toBe(expected)
  })
})

describe('loadSettings', () => {
  it('returns defaults when the file is missing', async () => {
    expect(await loadSettings(settingsPath())).toEqual(DEFAULTS)
  })

  it('returns defaults for malformed JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await writeFile(settingsPath(), '{not json', 'utf8')

    expect(await loadSettings(settingsPath())).toEqual(DEFAULTS)
    expect(warn).toHaveBeenCalled()
  })

  it('normalizes invalid fields and drops empty sort values', async () => {
    await writeJson({
      lastFolder: 42,
      volume: 5,
      lastView: '',
      sortByView: { albums: '', artists: 7, tracks: 'title' }
    })

    expect(await loadSettings(settingsPath())).toEqual({
      lastFolder: null,
      volume: 1,
      lastView: 'albums',
      sortByView: { tracks: 'title' },
      lyricPreference: 'sidecar'
    })
  })

  it.each([
    ['sidecar', 'sidecar'],
    ['embedded', 'embedded'],
    ['invalid', 'sidecar'],
    [null, 'sidecar'],
    [42, 'sidecar']
  ] as Array<[unknown, Settings['lyricPreference']]>)(
    'normalizes lyricPreference %j to %j',
    async (preference, expected) => {
      await writeJson({ lyricPreference: preference })

      expect((await loadSettings(settingsPath())).lyricPreference).toBe(expected)
    }
  )

  it.each([
    [-1, 0],
    [0.25, 0.25],
    [2, 1],
    [null, 1],
    ['0.5', 1]
  ] as Array<[unknown, number]>)('normalizes persisted volume %j to %j', async (volume, expected) => {
    await writeJson({ volume })

    expect((await loadSettings(settingsPath())).volume).toBe(expected)
  })

  it.each([
    ['   ', null],
    [42, null],
    ['/music', '/music'],
    [null, null]
  ] as Array<[unknown, string | null]>)('normalizes lastFolder %j to %j', async (folder, expected) => {
    await writeJson({ lastFolder: folder })

    expect((await loadSettings(settingsPath())).lastFolder).toBe(expected)
  })

  it('keeps unknown view and sort keys at this layer', async () => {
    await writeJson({ lastView: 'genres', sortByView: { albums: 'bogus', genres: 'title' } })

    const settings = await loadSettings(settingsPath())

    // Current behavior: normalizeUiState only checks for non-empty strings. The renderer later
    // validates view/sort keys with isLibraryView/isSortKey, despite TechnicalSpecs §2 invariant 8
    // expecting main-side validation. This test documents the behavior, not the invariant.
    expect(settings.lastView).toBe('genres')
    expect(settings.sortByView).toEqual({ albums: 'bogus', genres: 'title' })
  })

  it('falls back to defaults for an empty object', async () => {
    await writeJson({})

    expect(await loadSettings(settingsPath())).toEqual(DEFAULTS)
  })

  it('falls back to defaults when the JSON value is not an object', async () => {
    await writeJson([])

    expect(await loadSettings(settingsPath())).toEqual(DEFAULTS)
  })
})

describe('saveSettings', () => {
  it('writes normalized settings', async () => {
    const invalid = {
      lastFolder: '   ',
      volume: -3,
      lastView: '',
      sortByView: { albums: '', artists: 'name' },
      lyricPreference: 'bogus'
    } as unknown as Settings

    await saveSettings(settingsPath(), invalid)

    const raw = JSON.parse(await readFile(settingsPath(), 'utf8'))
    expect(raw).toEqual({
      lastFolder: null,
      volume: 0,
      lastView: 'albums',
      sortByView: { artists: 'name' },
      lyricPreference: 'sidecar'
    })
  })

  it('persists a valid lyric preference', async () => {
    await saveSettings(settingsPath(), { ...DEFAULTS, lyricPreference: 'embedded' })

    const raw = JSON.parse(await readFile(settingsPath(), 'utf8'))
    expect(raw.lyricPreference).toBe('embedded')
  })
})

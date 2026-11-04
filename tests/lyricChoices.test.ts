import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isValidLyricSourceId,
  isValidTrackId,
  LYRIC_CHOICES_VERSION,
  LyricChoiceStore,
  MAX_LYRIC_CHOICES
} from '../src/main/lyrics/choices'

let directory = ''

function choicesPath(): string {
  return join(directory, 'lyric-choices.json')
}

async function writeJson(value: unknown): Promise<void> {
  await writeFile(choicesPath(), JSON.stringify(value), 'utf8')
}

async function readJson(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(choicesPath(), 'utf8')) as Record<string, unknown>
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lyrix-choices-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('isValidTrackId', () => {
  it('accepts only 40-character lowercase hex ids', () => {
    expect(isValidTrackId('a'.repeat(40))).toBe(true)
    expect(isValidTrackId('0123456789abcdef0123456789abcdef01234567')).toBe(true)
    expect(isValidTrackId('A'.repeat(40))).toBe(false)
    expect(isValidTrackId('a'.repeat(39))).toBe(false)
    expect(isValidTrackId('a'.repeat(41))).toBe(false)
    expect(isValidTrackId('track-1')).toBe(false)
    expect(isValidTrackId(null)).toBe(false)
  })
})

describe('isValidLyricSourceId', () => {
  it.each(['embedded', 'sidecar:Song.lrc', 'sidecar:Song.en.lrc', 'sidecar:歌.lrc'])(
    'accepts %s',
    (value) => {
      expect(isValidLyricSourceId(value)).toBe(true)
    }
  )

  it.each([
    '',
    'embedded ',
    'online:Song.lrc',
    'sidecar:',
    'sidecar:../Song.lrc',
    'sidecar:a/Song.lrc',
    'sidecar:a\\Song.lrc',
    'sidecar:.',
    'sidecar:..',
    `sidecar:${'a'.repeat(256)}`,
    null,
    42
  ])('rejects %j', (value) => {
    expect(isValidLyricSourceId(value)).toBe(false)
  })
})

describe('LyricChoiceStore', () => {
  it('round-trips choices and reloads them from disk', async () => {
    const store = new LyricChoiceStore(choicesPath())
    await store.load()

    expect(store.get('track-1')).toBeNull()

    await store.set('track-1', 'sidecar:Song.lrc')
    await store.set('track-2', 'embedded')

    expect(store.get('track-1')).toBe('sidecar:Song.lrc')
    expect(store.get('track-2')).toBe('embedded')
    expect(await readJson()).toEqual({
      version: LYRIC_CHOICES_VERSION,
      tracks: { 'track-1': 'sidecar:Song.lrc', 'track-2': 'embedded' },
      translations: {}
    })

    const reloaded = new LyricChoiceStore(choicesPath())
    await reloaded.load()

    expect(reloaded.get('track-1')).toBe('sidecar:Song.lrc')
    expect(reloaded.get('track-2')).toBe('embedded')
  })

  it('clears a single choice', async () => {
    const store = new LyricChoiceStore(choicesPath())
    await store.load()
    await store.set('track-1', 'embedded')
    await store.set('track-2', 'sidecar:Song.lrc')

    await store.clear('track-1')

    expect(store.get('track-1')).toBeNull()
    expect(store.get('track-2')).toBe('sidecar:Song.lrc')
    expect(await readJson()).toEqual({
      version: LYRIC_CHOICES_VERSION,
      tracks: { 'track-2': 'sidecar:Song.lrc' },
      translations: {}
    })
  })

  it('returns an empty store for malformed JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await writeFile(choicesPath(), '{not json', 'utf8')

    const store = new LyricChoiceStore(choicesPath())
    await store.load()

    expect(store.get('track-1')).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('returns an empty store for a wrong version or malformed tracks', async () => {
    const store = new LyricChoiceStore(choicesPath())

    await writeJson({ version: 2, tracks: { 'track-1': 'embedded' } })
    await store.load()
    expect(store.get('track-1')).toBeNull()

    await writeJson({ version: LYRIC_CHOICES_VERSION, tracks: [] })
    await store.load()
    expect(store.get('track-1')).toBeNull()

    await writeJson({ version: LYRIC_CHOICES_VERSION, tracks: { 'track-1': 7 } })
    await store.load()
    expect(store.get('track-1')).toBeNull()
  })

  it('drops invalid entries while reading a valid file', async () => {
    await writeJson({
      version: LYRIC_CHOICES_VERSION,
      tracks: {
        good: 'embedded',
        badPath: 'sidecar:../Song.lrc',
        badType: 42,
        goodSidecar: 'sidecar:Song.en.lrc'
      }
    })

    const store = new LyricChoiceStore(choicesPath())
    await store.load()

    expect(store.get('good')).toBe('embedded')
    expect(store.get('goodSidecar')).toBe('sidecar:Song.en.lrc')
    expect(store.get('badPath')).toBeNull()
    expect(store.get('badType')).toBeNull()
  })

  it('rejects invalid source ids without writing them', async () => {
    const store = new LyricChoiceStore(choicesPath())
    await store.load()

    await store.set('track-1', 'sidecar:../Song.lrc')
    await store.set('track-2', 'online:Song.lrc')
    await store.set('track-3', 'sidecar:a/b.lrc')

    expect(store.get('track-1')).toBeNull()
    expect(store.get('track-2')).toBeNull()
    expect(store.get('track-3')).toBeNull()
    await expect(readFile(choicesPath(), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('caps the store at 5000 entries and drops the oldest', async () => {
    const tracks: Record<string, string> = {}
    for (let index = 0; index <= MAX_LYRIC_CHOICES; index += 1) {
      tracks[`track-${index}`] = 'embedded'
    }
    await writeJson({ version: LYRIC_CHOICES_VERSION, tracks })

    const store = new LyricChoiceStore(choicesPath())
    await store.load()

    expect(store.get('track-0')).toBeNull()
    expect(store.get('track-1')).toBe('embedded')
    expect(store.get(`track-${MAX_LYRIC_CHOICES}`)).toBe('embedded')

    await store.set('track-new', 'sidecar:Song.lrc')

    expect(store.get('track-1')).toBeNull()
    expect(store.get(`track-${MAX_LYRIC_CHOICES}`)).toBe('embedded')
    expect(store.get('track-new')).toBe('sidecar:Song.lrc')

    const raw = await readJson()
    expect(Object.keys(raw.tracks as Record<string, string>)).toHaveLength(MAX_LYRIC_CHOICES)
  })

  it('round-trips translation choices independently of main choices', async () => {
    const store = new LyricChoiceStore(choicesPath())
    await store.load()
    await store.set('track-1', 'sidecar:Song.lrc')
    await store.setTranslation('track-1', 'sidecar:Song.en.lrc')

    expect(store.get('track-1')).toBe('sidecar:Song.lrc')
    expect(store.getTranslation('track-1')).toBe('sidecar:Song.en.lrc')

    const reloaded = new LyricChoiceStore(choicesPath())
    await reloaded.load()
    expect(reloaded.get('track-1')).toBe('sidecar:Song.lrc')
    expect(reloaded.getTranslation('track-1')).toBe('sidecar:Song.en.lrc')

    await reloaded.clearTranslation('track-1')
    expect(reloaded.getTranslation('track-1')).toBeNull()
    expect(reloaded.get('track-1')).toBe('sidecar:Song.lrc')
  })

  it('treats a missing translations map as empty and keeps existing choices', async () => {
    await writeJson({
      version: LYRIC_CHOICES_VERSION,
      tracks: { 'track-1': 'sidecar:Song.lrc' }
    })

    const store = new LyricChoiceStore(choicesPath())
    await store.load()

    expect(store.get('track-1')).toBe('sidecar:Song.lrc')
    expect(store.getTranslation('track-1')).toBeNull()
  })

  it('drops invalid translation entries', async () => {
    await writeJson({
      version: LYRIC_CHOICES_VERSION,
      tracks: {},
      translations: {
        good: 'sidecar:Song.en.lrc',
        badPath: 'sidecar:../Song.en.lrc',
        badType: 42
      }
    })

    const store = new LyricChoiceStore(choicesPath())
    await store.load()

    expect(store.getTranslation('good')).toBe('sidecar:Song.en.lrc')
    expect(store.getTranslation('badPath')).toBeNull()
    expect(store.getTranslation('badType')).toBeNull()

    await store.setTranslation('track-1', 'sidecar:../Song.en.lrc')
    expect(store.getTranslation('track-1')).toBeNull()
  })

  it('caps the translations map at 5000 entries independently', async () => {
    const translations: Record<string, string> = {}
    for (let index = 0; index <= MAX_LYRIC_CHOICES; index += 1) {
      translations[`track-${index}`] = 'sidecar:Song.en.lrc'
    }
    await writeJson({ version: LYRIC_CHOICES_VERSION, tracks: {}, translations })

    const store = new LyricChoiceStore(choicesPath())
    await store.load()

    expect(store.getTranslation('track-0')).toBeNull()
    expect(store.getTranslation('track-1')).toBe('sidecar:Song.en.lrc')
    expect(store.getTranslation(`track-${MAX_LYRIC_CHOICES}`)).toBe('sidecar:Song.en.lrc')

    await store.setTranslation('track-new', 'sidecar:Song.en.lrc')

    expect(store.getTranslation('track-1')).toBeNull()
    expect(store.getTranslation('track-new')).toBe('sidecar:Song.en.lrc')

    const raw = await readJson()
    expect(Object.keys(raw.translations as Record<string, string>)).toHaveLength(
      MAX_LYRIC_CHOICES
    )
  })
})

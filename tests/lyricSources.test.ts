import { describe, expect, it } from 'vitest'
import { selectLyricSource } from '../src/shared/lyrics/sources'
import type {
  LyricPreference,
  LyricSourceOption
} from '../src/shared/lyrics/sources'

function option(
  id: string,
  kind: 'embedded' | 'sidecar',
  available = true,
  text: string | null = available ? id : null
): LyricSourceOption {
  return {
    id,
    kind,
    label: kind === 'embedded' ? 'Embedded tag' : 'Sidecar file',
    detail: kind === 'embedded' ? 'common.lyrics' : id.slice('sidecar:'.length),
    available,
    text
  }
}

const embedded = option('embedded', 'embedded')
const exactSidecar = option('sidecar:Song.lrc', 'sidecar')
const english = option('sidecar:Song.en.lrc', 'sidecar')
const japanese = option('sidecar:Song.ja.lrc', 'sidecar')

function select(
  options: LyricSourceOption[],
  savedChoice: string | null,
  preference: LyricPreference,
  isUsable?: (option: LyricSourceOption) => boolean
) {
  return selectLyricSource(options, { savedChoice, preference, isUsable })
}

describe('selectLyricSource', () => {
  it('returns the saved choice when it is available and usable', () => {
    const result = select([embedded, exactSidecar, english], 'sidecar:Song.en.lrc', 'sidecar')

    expect(result).toEqual({ option: english, mode: 'saved' })
  })

  it('falls back to auto when the saved choice no longer exists', () => {
    const result = select([embedded, exactSidecar], 'sidecar:Song.gone.lrc', 'sidecar')

    expect(result).toEqual({ option: exactSidecar, mode: 'auto' })
  })

  it('falls back to auto when the saved choice is unavailable', () => {
    const unavailable = option('sidecar:Song.lrc', 'sidecar', false)
    const result = select([embedded, unavailable], 'sidecar:Song.lrc', 'embedded')

    expect(result).toEqual({ option: embedded, mode: 'auto' })
  })

  it('skips a saved choice that is available but not usable', () => {
    const result = select([embedded, exactSidecar], 'sidecar:Song.lrc', 'sidecar', (candidate) => {
      return candidate.id !== 'sidecar:Song.lrc'
    })

    expect(result).toEqual({ option: embedded, mode: 'auto' })
  })

  it('prefers the exact sidecar over the embedded tag for the sidecar preference', () => {
    expect(select([embedded, exactSidecar, english], null, 'sidecar')).toEqual({
      option: exactSidecar,
      mode: 'auto'
    })
  })

  it('prefers the embedded tag for the embedded preference', () => {
    expect(select([embedded, exactSidecar, english], null, 'embedded')).toEqual({
      option: embedded,
      mode: 'auto'
    })
  })

  it('uses the embedded tag before variants when the exact sidecar is missing', () => {
    const missingExact = option('sidecar:Song.lrc', 'sidecar', false)

    expect(select([embedded, missingExact, english, japanese], null, 'sidecar')).toEqual({
      option: embedded,
      mode: 'auto'
    })
  })

  it('uses the exact sidecar before variants when the embedded tag is unusable', () => {
    expect(select([embedded, exactSidecar, english], null, 'embedded', (candidate) => {
      return candidate.kind !== 'embedded'
    })).toEqual({ option: exactSidecar, mode: 'auto' })
  })

  it('uses variant sidecars in canonical order when earlier sources are missing', () => {
    const missingEmbedded = option('embedded', 'embedded', false)
    const missingExact = option('sidecar:Song.lrc', 'sidecar', false)

    expect(select([missingEmbedded, missingExact, english, japanese], null, 'sidecar')).toEqual({
      option: english,
      mode: 'auto'
    })
  })

  it('returns null when nothing is available', () => {
    const options = [
      option('embedded', 'embedded', false),
      option('sidecar:Song.lrc', 'sidecar', false),
      option('sidecar:Song.en.lrc', 'sidecar', false)
    ]

    expect(select(options, 'sidecar:Song.en.lrc', 'sidecar')).toBeNull()
  })

  it('treats availability as the default usability predicate', () => {
    const availableButEmpty = option('embedded', 'embedded', true, '   ')
    const result = select([availableButEmpty], null, 'embedded')

    expect(result).toEqual({ option: availableButEmpty, mode: 'auto' })
  })
})

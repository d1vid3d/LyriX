import { describe, expect, it } from 'vitest'
import { selectLyricSource, selectTranslationSource } from '../src/shared/lyrics/sources'
import type { LyricPreference, LyricSourceOption } from '../src/shared/lyrics/sources'

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
    text,
    variant: null
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
    expect(
      select([embedded, exactSidecar, english], null, 'embedded', (candidate) => {
        return candidate.kind !== 'embedded'
      })
    ).toEqual({ option: exactSidecar, mode: 'auto' })
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

describe('selectTranslationSource', () => {
  function withVariant(source: LyricSourceOption, variant: string | null): LyricSourceOption {
    return { ...source, variant }
  }

  const primary = withVariant(exactSidecar, null)
  const en = withVariant(option('sidecar:Song.en.lrc', 'sidecar'), 'en')
  const enUs = withVariant(option('sidecar:Song.en-US.lrc', 'sidecar'), 'en-US')
  const ja = withVariant(option('sidecar:Song.ja.lrc', 'sidecar'), 'ja')

  it('prefers an eligible saved choice over the language match', () => {
    const result = selectTranslationSource([primary, en, ja], {
      primaryId: primary.id,
      savedChoice: ja.id,
      language: 'en'
    })

    expect(result).toEqual({ option: ja, mode: 'saved' })
  })

  it('falls back to auto when the saved choice is the primary source', () => {
    const result = selectTranslationSource([primary, en], {
      primaryId: primary.id,
      savedChoice: primary.id,
      language: 'en'
    })

    expect(result).toEqual({ option: en, mode: 'auto' })
  })

  it('matches the language case-insensitively across regional variants', () => {
    expect(
      selectTranslationSource([primary, enUs], {
        primaryId: primary.id,
        savedChoice: null,
        language: 'en'
      })
    ).toEqual({ option: enUs, mode: 'auto' })

    expect(
      selectTranslationSource([primary, withVariant(en, 'EN')], {
        primaryId: primary.id,
        savedChoice: null,
        language: 'en-us'
      })
    ).toEqual({ option: withVariant(en, 'EN'), mode: 'auto' })
  })

  it('uses the single eligible option when no language matches', () => {
    const result = selectTranslationSource([primary, ja], {
      primaryId: primary.id,
      savedChoice: null,
      language: 'en'
    })

    expect(result).toEqual({ option: ja, mode: 'auto' })
  })

  it('returns null when several options are eligible but none match', () => {
    const result = selectTranslationSource([primary, en, ja], {
      primaryId: primary.id,
      savedChoice: null,
      language: 'fr'
    })

    expect(result).toBeNull()
  })

  it('excludes the primary, unavailable, and unusable options', () => {
    const unavailable = option('sidecar:Song.fr.lrc', 'sidecar', false)
    const result = selectTranslationSource([primary, unavailable, en], {
      primaryId: primary.id,
      savedChoice: null,
      language: 'fr',
      isUsable: (candidate) => candidate.id !== unavailable.id
    })

    expect(result).toEqual({ option: en, mode: 'auto' })
  })

  it('sorts eligible options alphabetically by id', () => {
    const later = withVariant(option('sidecar:Song.zz.lrc', 'sidecar'), 'en')
    const earlier = withVariant(option('sidecar:Song.aa.lrc', 'sidecar'), 'en')
    const result = selectTranslationSource([later, earlier], {
      primaryId: null,
      savedChoice: null,
      language: 'en'
    })

    expect(result).toEqual({ option: earlier, mode: 'auto' })
  })
})

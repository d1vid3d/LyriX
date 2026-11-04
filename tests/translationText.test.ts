import { describe, expect, it } from 'vitest'
import type { LyricLine } from '../src/shared/lyrics'
import { translationTextForLine } from '../src/renderer/lyrics/translationText'

function line(translations?: Record<string, string>): LyricLine {
  return {
    index: 0,
    start: 0,
    end: 1,
    endIsEstimated: true,
    text: 'primary',
    ...(translations === undefined ? {} : { translations })
  }
}

describe('translationTextForLine', () => {
  it('returns null when no translation key is selected', () => {
    expect(translationTextForLine(line({ en: 'hello' }), null)).toBeNull()
  })

  it('returns null when the line has no translation for the key', () => {
    expect(translationTextForLine(line({ ja: 'こんにちは' }), 'en')).toBeNull()
    expect(translationTextForLine(line(), 'en')).toBeNull()
  })

  it('returns null for empty or whitespace-only translations', () => {
    expect(translationTextForLine(line({ en: '' }), 'en')).toBeNull()
    expect(translationTextForLine(line({ en: '   ' }), 'en')).toBeNull()
  })

  it('returns the matching plain translation text', () => {
    expect(translationTextForLine(line({ en: 'hello there' }), 'en')).toBe('hello there')
    expect(translationTextForLine(line({ en: 'hello', ja: 'こんにちは' }), 'ja')).toBe(
      'こんにちは'
    )
  })
})

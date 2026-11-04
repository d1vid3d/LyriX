import { describe, expect, it } from 'vitest'
import {
  isLanguageTag,
  languageLabel,
  translationSidecarExample
} from '../src/renderer/lyrics/translationLabels'

describe('translation language helpers', () => {
  it('accepts BCP-47-shaped variants only', () => {
    expect(isLanguageTag('en')).toBe(true)
    expect(isLanguageTag('EN')).toBe(true)
    expect(isLanguageTag('en-US')).toBe(true)
    expect(isLanguageTag('zh-Hant-TW')).toBe(true)
    expect(isLanguageTag('e')).toBe(false)
    expect(isLanguageTag('english')).toBe(false)
    expect(isLanguageTag('not a tag')).toBe(false)
    expect(isLanguageTag(null)).toBe(false)
  })

  it('returns English display names for valid tags', () => {
    expect(languageLabel('en')).toBe('English')
    expect(languageLabel('EN')).toBe('English')
    expect(languageLabel('ja')).toBe('Japanese')
    expect(languageLabel('en-US')).toBe('American English')
  })

  it('falls back to the raw variant for invalid tags and missing values', () => {
    expect(languageLabel('not a tag')).toBe('not a tag')
    expect(languageLabel('en_US')).toBe('en_US')
    expect(languageLabel(null)).toBeNull()
  })

  it('builds a sidecar example from the expected name', () => {
    expect(translationSidecarExample('Song.lrc', 'ja')).toBe('Song.ja.lrc')
    expect(translationSidecarExample('Song.lrc', null)).toBe('Song.EN.lrc')
    expect(translationSidecarExample('Track.LRC', 'fr')).toBe('Track.fr.lrc')
    expect(translationSidecarExample('', 'de')).toBe('Song.de.lrc')
  })
})

import { describe, expect, it } from 'vitest'
import { alignTranslation, attachTranslation, isBlankLyricText } from '../src/shared/lyrics/translation'
import type { LyricDocument, LyricLine } from '../src/shared/lyrics/types'

interface LineInput {
  text: string
  start: number
  agent?: string
}

function line(input: LineInput, index: number): LyricLine {
  return {
    index,
    start: input.start,
    end: input.start + 1,
    endIsEstimated: false,
    text: input.text,
    ...(input.agent ? { agent: input.agent } : {})
  }
}

function document(inputs: LineInput[], timed = true): LyricDocument {
  return {
    format: timed ? 'lrc' : 'plain',
    timed,
    metadata: { raw: {} },
    lines: inputs.map(line),
    warnings: []
  }
}

describe('isBlankLyricText', () => {
  it.each(['', '   ', '♪', '♪ ♫', '...', '！？', '\t\n'])('treats %j as blank', (text) => {
    expect(isBlankLyricText(text)).toBe(true)
  })

  it.each(['hello', 'こんにちは', '123', 'a♪'])('treats %j as non-blank', (text) => {
    expect(isBlankLyricText(text)).toBe(false)
  })
})

describe('alignTranslation', () => {
  it('matches timed lines one-to-one within tolerance', () => {
    const primary = document([
      { text: 'one', start: 0 },
      { text: 'two', start: 10 }
    ])
    const translation = document([
      { text: 'uno', start: 0.2 },
      { text: 'dos', start: 10.4 }
    ])

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual(['uno', 'dos'])
    expect(result.report).toEqual({
      method: 'time',
      matched: 2,
      total: 2,
      unmatchedTranslationLines: 0
    })
  })

  it('does not match beyond the tolerance and falls back to index for equal counts', () => {
    const primary = document([
      { text: 'one', start: 0 },
      { text: 'two', start: 10 }
    ])
    const translation = document([
      { text: 'uno', start: 5 },
      { text: 'dos', start: 15 }
    ])

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual(['uno', 'dos'])
    expect(result.report.method).toBe('index')
  })

  it('keeps only the time matches when counts differ and the ratio is low', () => {
    const primary = document([
      { text: 'one', start: 0 },
      { text: 'two', start: 10 },
      { text: 'three', start: 20 }
    ])
    const translation = document([
      { text: 'uno', start: 0.1 },
      { text: 'dos', start: 99 }
    ])

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual(['uno', null, null])
    expect(result.report).toEqual({
      method: 'partial',
      matched: 1,
      total: 3,
      unmatchedTranslationLines: 1
    })
  })

  it('reports none when nothing matches and counts differ', () => {
    const primary = document([
      { text: 'one', start: 0 },
      { text: 'two', start: 10 }
    ])
    const translation = document([
      { text: 'uno', start: 50 },
      { text: 'dos', start: 60 },
      { text: 'tres', start: 70 }
    ])

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual([null, null])
    expect(result.report.method).toBe('none')
    expect(result.report.unmatchedTranslationLines).toBe(3)
  })

  it('counts extra translation lines as unmatched', () => {
    const primary = document([{ text: 'one', start: 0 }])
    const translation = document([
      { text: 'uno', start: 0.1 },
      { text: 'dos', start: 10 },
      { text: 'tres', start: 20 }
    ])

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual(['uno'])
    expect(result.report).toMatchObject({ method: 'time', matched: 1, total: 1 })
    expect(result.report.unmatchedTranslationLines).toBe(2)
  })

  it('skips blank primary lines and never displays blank translations', () => {
    const primary = document([
      { text: '♪', start: 0 },
      { text: 'one', start: 1 },
      { text: 'two', start: 2 }
    ])
    const translation = document([
      { text: '♪', start: 0.1 },
      { text: 'uno', start: 1.1 },
      { text: 'dos', start: 2.1 }
    ])

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual([null, 'uno', 'dos'])
    expect(result.report).toMatchObject({ method: 'time', matched: 2, total: 2 })
  })

  it('pairs duet lines sharing a timestamp with distinct translations', () => {
    const primary = document([
      { text: 'one', start: 10, agent: 'v1' },
      { text: 'two', start: 10, agent: 'v2' }
    ])
    const translation = document([
      { text: 'uno', start: 10 },
      { text: 'dos', start: 10 }
    ])

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual(['uno', 'dos'])
    expect(result.report.method).toBe('time')
  })

  it('falls back to index for an untimed translation with equal counts', () => {
    const primary = document([{ text: 'one', start: 0 }])
    const translation = document([{ text: 'uno', start: 0 }], false)

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual(['uno'])
    expect(result.report.method).toBe('index')
  })

  it('falls back to index for untimed primary lyrics', () => {
    const primary = document([
      { text: 'one', start: 0 },
      { text: 'two', start: 0 }
    ], false)
    const translation = document([
      { text: 'uno', start: 0 },
      { text: 'dos', start: 0 }
    ], false)

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual(['uno', 'dos'])
    expect(result.report.method).toBe('index')
  })

  it('uses index pairing with blank lines included when counts are equal', () => {
    const primary = document([
      { text: 'one', start: 0 },
      { text: 'two', start: 10 }
    ])
    const translation = document([
      { text: 'uno', start: 50 },
      { text: '♪', start: 60 }
    ])

    const result = alignTranslation(primary, translation)

    expect(result.lines).toEqual(['uno', null])
    expect(result.report).toEqual({
      method: 'index',
      matched: 1,
      total: 2,
      unmatchedTranslationLines: 0
    })
  })

  it('honors custom tolerance and ratio options', () => {
    const primary = document([{ text: 'one', start: 0 }])
    const translation = document([{ text: 'uno', start: 0.9 }])

    expect(alignTranslation(primary, translation, { toleranceSeconds: 0.5 }).report.method).toBe(
      'index'
    )
    expect(alignTranslation(primary, translation, { toleranceSeconds: 1 }).report.method).toBe(
      'time'
    )
  })
})

describe('attachTranslation', () => {
  it('returns a new document and leaves the input untouched', () => {
    const primary = document([{ text: 'one', start: 0 }])
    primary.lines[0].segments = [
      { text: 'one', start: 0, end: 1, spaceAfter: false }
    ]
    primary.lines[0].agent = 'v1'

    const attached = attachTranslation(primary, 'sidecar:Song.en.lrc', ['uno'])

    expect(attached).not.toBe(primary)
    expect(attached.lines[0]).not.toBe(primary.lines[0])
    expect(primary.lines[0].translations).toBeUndefined()
    expect(attached.lines[0].translations).toEqual({ 'sidecar:Song.en.lrc': 'uno' })
    expect(attached.lines[0].segments).toEqual(primary.lines[0].segments)
    expect(attached.lines[0].agent).toBe('v1')
    expect(attached.lines[0].start).toBe(0)
    expect(attached.lines[0].end).toBe(1)
  })

  it('skips null entries and merges existing translations', () => {
    const primary = document([
      { text: 'one', start: 0 },
      { text: 'two', start: 1 }
    ])
    primary.lines[0].translations = { old: 'uno-old' }

    const attached = attachTranslation(primary, 'en', [null, 'dos'])

    expect(attached.lines[0].translations).toEqual({ old: 'uno-old' })
    expect(attached.lines[1].translations).toEqual({ en: 'dos' })
    expect(primary.lines[0].translations).toEqual({ old: 'uno-old' })
    expect(primary.lines[1].translations).toBeUndefined()
  })
})

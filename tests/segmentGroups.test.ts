import { describe, expect, it } from 'vitest'
import { groupSegments } from '../src/renderer/lyrics/segmentGroups'
import type { LyricSegment } from '../src/shared/lyrics'

function segment(text: string, spaceAfter: boolean): LyricSegment {
  return { text, start: 0, end: 1, spaceAfter }
}

function words(groups: ReturnType<typeof groupSegments>): string[][] {
  return groups.map((group) => group.segments.map((item) => item.text))
}

describe('groupSegments', () => {
  it('groups syllables until a segment has trailing whitespace', () => {
    const groups = groupSegments([
      segment('To', true),
      segment('the', true),
      segment('up', false),
      segment('tight', true),
      segment('tempo', true)
    ])

    expect(words(groups)).toEqual([['To'], ['the'], ['up', 'tight'], ['tempo']])
    expect(groups.map((group) => group.spaceAfter)).toEqual([true, true, true, true])
  })

  it('keeps segments without a trailing space in one word container', () => {
    const groups = groupSegments([segment('un', false), segment('break', false), segment('able', true)])

    expect(words(groups)).toEqual([['un', 'break', 'able']])
  })

  it('closes the final word even without trailing whitespace', () => {
    const groups = groupSegments([segment('last', false)])

    expect(words(groups)).toEqual([['last']])
    expect(groups[0].spaceAfter).toBe(false)
  })

  it('returns no groups for an empty segment list', () => {
    expect(groupSegments([])).toEqual([])
  })
})

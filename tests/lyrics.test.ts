import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  detectLyricFormat,
  findActiveLineIndex,
  findActiveLineIndexes,
  findActiveSegmentIndex,
  lineProgress,
  parseLyrics,
  segmentProgress
} from '../src/shared/lyrics'

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')
}

function byStart(doc: ReturnType<typeof parseLyrics>, start: number) {
  const line = doc.lines.find((item) => Math.abs(item.start - start) < 1e-6)
  if (!line) throw new Error(`No line starting at ${start}`)
  return line
}

describe('TimedWordByWord.txt', () => {
  const doc = parseLyrics(fixture('TimedWordByWord.txt'))

  it('detects enhanced LRC and reads metadata', () => {
    expect(doc.format).toBe('enhanced-lrc')
    expect(doc.timed).toBe(true)
    expect(doc.metadata.title).toBe("Merry Christmas, Please Don't Call")
    expect(doc.metadata.artist).toBe('Bleachers')
    expect(doc.metadata.raw.ti).toBe("Merry Christmas, Please Don't Call")
    expect(doc.metadata.author).toContain('SpotiFLAC')
    expect(doc.warnings).toEqual([])
  })

  it('parses the first line, agent, text and word segments', () => {
    const line = doc.lines[0]

    expect(line.start).toBeCloseTo(5.107, 6)
    expect(line.end).toBeCloseTo(7.374, 6)
    expect(line.endIsEstimated).toBe(false)
    expect(line.agent).toBe('v1')
    expect(line.text).toBe('To the tempo of your uptight')

    const up = line.segments?.find((segment) => segment.text === 'up')
    expect(up).toBeDefined()
    expect(up?.start).toBeCloseTo(6.464, 6)
    expect(up?.end).toBeCloseTo(6.736, 6)
    expect(up?.spaceAfter).toBe(false)

    const tight = line.segments?.find((segment) => segment.text === 'tight')
    expect(tight).toBeDefined()
    expect(tight?.start).toBeCloseTo(6.736, 6)
    expect(tight?.end).toBeCloseTo(7.374, 6)
  })

  it('handles short and long fractional digit counts', () => {
    const line = byStart(doc, 43.78)
    expect(line.start).toBeCloseTo(43.78, 6)
    expect(line.segments?.[0].start).toBeCloseTo(43.78, 6)

    const later = byStart(doc, 65.05)
    expect(later.start).toBeCloseTo(65.05, 6)
    expect(later.segments?.[0].start).toBeCloseTo(65.05, 6)
  })

  it('keeps overlapping lines active while findActiveLineIndex prefers the later one', () => {
    const earlier = byStart(doc, 164.33)
    const later = byStart(doc, 165.739)

    expect(earlier.end).toBeCloseTo(166.064, 6)
    expect(later.end).toBeCloseTo(168.355, 6)
    expect(findActiveLineIndexes(doc, 165.9)).toEqual([earlier.index, later.index])
    expect(findActiveLineIndex(doc, 165.9)).toBe(later.index)
  })

  it('stays on the previous line in a gap without reporting it active', () => {
    const first = byStart(doc, 7.374)
    expect(first.end).toBeCloseTo(9.659, 6)

    expect(findActiveLineIndex(doc, 10)).toBe(first.index)
    expect(findActiveLineIndexes(doc, 10)).toEqual([])
  })
})

describe('LineByLine.txt', () => {
  const doc = parseLyrics(fixture('LineByLine.txt'))

  it('detects line-level LRC and estimates the first end', () => {
    expect(doc.format).toBe('lrc')
    expect(doc.timed).toBe(true)
    expect(doc.metadata.title).toBe('Cry Baby')

    const line = doc.lines[0]
    expect(line.start).toBeCloseTo(20.36, 6)
    expect(line.end).toBeCloseTo(24.83, 6)
    expect(line.endIsEstimated).toBe(true)
    expect(line.segments).toBeUndefined()
    expect(line.agent).toBeUndefined()
    expect(line.text).toBe('I think I talk too much')
  })

  it('caps a long gap at the max estimated line length', () => {
    const line = byStart(doc, 151.78)
    expect(line.end).toBeCloseTo(161.78, 6)
    expect(line.endIsEstimated).toBe(true)
  })

  it('gives the last line a short estimated end', () => {
    const last = doc.lines[doc.lines.length - 1]
    expect(last.start).toBeCloseTo(229.32, 6)
    expect(last.end).toBeCloseTo(234.32, 6)
    expect(last.endIsEstimated).toBe(true)
  })
})

describe('inline cases', () => {
  it('expands multiple leading timestamps into separate lines', () => {
    const doc = parseLyrics('[00:10.00][00:50.00]Hello')

    expect(doc.format).toBe('lrc')
    expect(doc.lines.map((line) => line.text)).toEqual(['Hello', 'Hello'])
    expect(doc.lines[0].start).toBeCloseTo(10, 6)
    expect(doc.lines[1].start).toBeCloseTo(50, 6)
    expect(doc.lines.map((line) => line.index)).toEqual([0, 1])
  })

  it('applies a positive offset by moving times earlier', () => {
    const text = '[offset:500]\n[00:10.00]Hi\n[00:20.00]There'

    const shifted = parseLyrics(text)
    expect(shifted.metadata.offsetMs).toBe(500)
    expect(shifted.lines[0].start).toBeCloseTo(9.5, 6)

    const raw = parseLyrics(text, { applyOffset: false })
    expect(raw.lines[0].start).toBeCloseTo(10, 6)
  })

  it('parses plain text without timing and ignores header lines', () => {
    const doc = parseLyrics('[ti:Ignored]\n\nFirst line\nSecond line')

    expect(doc.format).toBe('plain')
    expect(doc.timed).toBe(false)
    expect(doc.lines.map((line) => line.text)).toEqual(['First line', 'Second line'])
    expect(doc.lines.every((line) => line.start === 0 && line.end === 0)).toBe(true)
  })

  it('returns an empty untimed document for empty input', () => {
    const doc = parseLyrics('')

    expect(doc.format).toBe('plain')
    expect(doc.timed).toBe(false)
    expect(doc.lines).toEqual([])
    expect(doc.warnings).toEqual([])
  })

  it('warns about garbage lines instead of throwing', () => {
    const doc = parseLyrics('[00:10.00]Good\nthis is not timed\n[also bad')

    expect(doc.format).toBe('lrc')
    expect(doc.lines).toHaveLength(1)
    expect(doc.lines[0].text).toBe('Good')
    expect(doc.warnings.length).toBeGreaterThan(0)
  })

  it('accepts CRLF and a leading BOM', () => {
    const doc = parseLyrics('\uFEFF[00:10.00]One\r\n[00:12.50]Two\r\n')

    expect(doc.format).toBe('lrc')
    expect(doc.lines.map((line) => line.text)).toEqual(['One', 'Two'])
    expect(doc.lines[1].start).toBeCloseTo(12.5, 6)
  })

  it('treats .5, .50 and .500 as the same time', () => {
    const doc = parseLyrics('[00:10.5]a\n[00:10.50]b\n[00:10.500]c')
    const starts = doc.lines.map((line) => line.start)

    expect(new Set(starts).size).toBe(1)
    expect(starts[0]).toBeCloseTo(10.5, 6)
    expect(doc.lines.map((line) => line.text)).toEqual(['a', 'b', 'c'])
  })

  it('detects each format', () => {
    expect(detectLyricFormat('[00:10.00]Line')).toBe('lrc')
    expect(detectLyricFormat('[00:10.00]<00:10.00>Word')).toBe('enhanced-lrc')
    expect(detectLyricFormat('Just text')).toBe('plain')
  })
})

describe('sync helpers', () => {
  it('finds lines and progress in estimated line-level timing', () => {
    const doc = parseLyrics('[00:10.00]One\n[00:20.00]Two')
    const first = doc.lines[0]

    expect(findActiveLineIndexes(doc, 10)).toEqual([0])
    expect(findActiveLineIndexes(doc, 19.999)).toEqual([0])
    expect(lineProgress(first, 5)).toBe(0)
    expect(lineProgress(first, 15)).toBeCloseTo(0.5, 6)
    expect(lineProgress(first, 25)).toBe(1)
  })

  it('finds word segments and clamps segment progress', () => {
    const doc = parseLyrics(fixture('TimedWordByWord.txt'))
    const line = doc.lines[0]

    expect(findActiveSegmentIndex(line, 5)).toBe(-1)
    const upIndex = findActiveSegmentIndex(line, 6.5)
    expect(line.segments?.[upIndex].text).toBe('up')

    const up = line.segments![upIndex]
    expect(segmentProgress(up, up.start)).toBe(0)
    expect(segmentProgress(up, 6.6)).toBeCloseTo(0.5, 6)
    expect(segmentProgress(up, up.end)).toBe(1)
  })

  it('reports nothing for untimed documents', () => {
    const doc = parseLyrics('One\nTwo')

    expect(findActiveLineIndex(doc, 0)).toBe(-1)
    expect(findActiveLineIndexes(doc, 0)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { parseByteRange } from '../src/main/range'
import type { RangeResult } from '../src/main/range'

const cases: Array<[string, number, RangeResult]> = [
  ['bytes=0-99', 1000, { start: 0, end: 99 }],
  ['bytes=100-', 1000, { start: 100, end: 999 }],
  ['bytes=-100', 1000, { start: 900, end: 999 }],
  ['bytes=-2000', 1000, { start: 0, end: 999 }],
  ['bytes=0-5000', 1000, { start: 0, end: 999 }],
  ['bytes=999-', 1000, { start: 999, end: 999 }],
  ['bytes=5-5', 1000, { start: 5, end: 5 }],
  ['bytes=00-01', 1000, { start: 0, end: 1 }],
  ['  bytes=0-1  ', 1000, { start: 0, end: 1 }],
  ['bytes=-5', 3, { start: 0, end: 2 }],
  ['bytes=1000-', 1000, 'unsatisfiable'],
  ['bytes=1000-1005', 1000, 'unsatisfiable'],
  ['bytes=50-10', 1000, 'invalid'],
  ['bytes=', 1000, 'invalid'],
  ['bytes=-', 1000, 'invalid'],
  ['bytes=abc-def', 1000, 'invalid'],
  ['bytes=0-1,2-3', 1000, 'invalid'],
  ['items=0-1', 1000, 'invalid'],
  ['bytes=0', 1000, 'invalid'],
  ['bytes=--1', 1000, 'invalid'],
  ['bytes=0-', 0, 'unsatisfiable'],
  ['bytes=-0', 1000, 'unsatisfiable'],
  ['bytes=9007199254740992-', 1000, 'invalid'],
  ['bytes=0-9007199254740992', 1000, 'invalid']
]

describe('parseByteRange', () => {
  it.each(cases)('parses %s for size %i', (header, size, expected) => {
    expect(parseByteRange(header, size)).toEqual(expected)
  })
})

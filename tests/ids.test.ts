import { describe, expect, it } from 'vitest'
import { hashId } from '../src/main/ids'

describe('hashId', () => {
  it('returns the SHA-1 hex digest of the input', () => {
    expect(hashId('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(hashId('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  it('is deterministic', () => {
    expect(hashId('C:\\Music\\song.flac')).toBe(hashId('C:\\Music\\song.flac'))
  })

  it.each(['a', 'C:\\Music\\song.flac', 'Beyoncé — 歌', ''])(
    'returns 40 lowercase hex characters for %j',
    (value) => {
      expect(hashId(value)).toMatch(/^[a-f0-9]{40}$/)
    }
  )

  it('differs for different inputs', () => {
    expect(hashId('a')).not.toBe(hashId('b'))
  })
})

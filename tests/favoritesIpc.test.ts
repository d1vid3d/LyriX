import { describe, expect, it } from 'vitest'
import { parseFavoriteSetInput } from '../src/main/lyrixdata/favoritesIpc'

const idA = 'a'.repeat(40)
const idB = 'b'.repeat(40)

describe('parseFavoriteSetInput', () => {
  it('accepts valid id arrays and deduplicates', () => {
    expect(
      parseFavoriteSetInput({ trackIds: [idA, idA, idB], favorite: true })
    ).toEqual({ trackIds: [idA, idB], favorite: true })
  })

  it('rejects invalid ids, non-booleans, and wrong shapes', () => {
    expect(parseFavoriteSetInput(null)).toBeNull()
    expect(parseFavoriteSetInput({ trackIds: [idA], favorite: 'yes' })).toBeNull()
    expect(parseFavoriteSetInput({ trackIds: [idA, 'bad'], favorite: true })).toBeNull()
    expect(parseFavoriteSetInput({ trackIds: 'bad', favorite: true })).toBeNull()
  })

  it('caps the number of ids per call', () => {
    const tooMany = Array.from({ length: 1001 }, (_, index) =>
      index.toString(16).padStart(40, '0')
    )
    expect(parseFavoriteSetInput({ trackIds: tooMany, favorite: false })).toBeNull()
  })
})

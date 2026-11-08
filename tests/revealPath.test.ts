import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { isPathInside, isRevealPathAllowed } from '../src/main/pathContainment'

const root = resolve('library')
const inside = join(root, 'Album', 'track.flac')

describe('isPathInside', () => {
  it('accepts strict descendants only', () => {
    expect(isPathInside(root, inside)).toBe(true)
    expect(isPathInside(root, root)).toBe(false)
    expect(isPathInside(root, resolve('library2', 'track.flac'))).toBe(false)
    expect(isPathInside(join(root, 'Album'), root)).toBe(false)
  })
})

describe('isRevealPathAllowed', () => {
  it('requires canonical paths inside the root and a FLAC extension', () => {
    expect(isRevealPathAllowed(root, inside)).toBe(true)
    expect(isRevealPathAllowed(root, join(root, 'Album', 'track.FLAC'))).toBe(true)
    expect(isRevealPathAllowed(root, join(root, 'Album', 'cover.jpg'))).toBe(false)
    expect(isRevealPathAllowed(null, inside)).toBe(false)
    expect(isRevealPathAllowed(root, null)).toBe(false)
    expect(isRevealPathAllowed(root, root)).toBe(false)
  })

  it('rejects traversal and sibling prefixes', () => {
    expect(isRevealPathAllowed(root, resolve('library2', 'track.flac'))).toBe(false)
    expect(isRevealPathAllowed(root, resolve('track.flac'))).toBe(false)
  })
})

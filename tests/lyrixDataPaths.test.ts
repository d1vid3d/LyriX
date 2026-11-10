import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Track } from '../src/shared/types'
import {
  findLyrixDataDirName,
  isAllowedLyrixDataFile,
  isLyrixDataDirName,
  isSafeRefPath,
  normalizeRefPath,
  refPathKey,
  toPortableLibraryPath
} from '../src/main/lyrixdata/paths'
import {
  buildRefIndex,
  createTrackRef,
  fingerprintKey,
  resolveTrackRef
} from '../src/main/lyrixdata/trackRef'
import type { TrackRef } from '../src/main/lyrixdata/trackRef'

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNumber: 1,
    discNumber: null,
    year: null,
    duration: 10,
    url: `media://track/${id}`,
    ...overrides
  }
}

const root = join('library-root')

function refFor(path: string, overrides: Partial<Track> = {}): TrackRef {
  const trackValue = track('a'.repeat(40), overrides)
  const ref = createTrackRef(trackValue, root, join(root, ...path.split('/')))
  if (!ref) throw new Error('ref')
  return ref
}

describe('LyrixData paths', () => {
  it('detects the directory case-insensitively and only allows known files', () => {
    expect(findLyrixDataDirName(['music', 'lyrixdata'])).toBe('lyrixdata')
    expect(findLyrixDataDirName(['music'])).toBeNull()
    expect(isLyrixDataDirName('LyrixData')).toBe(true)
    expect(isAllowedLyrixDataFile('favorites.json')).toBe(true)
    expect(isAllowedLyrixDataFile('history.json')).toBe(false)
  })

  it('normalizes library paths to forward-slash NFC portable form', () => {
    expect(toPortableLibraryPath(root, join(root, 'Album', 'Song.flac'))).toBe('Album/Song.flac')
    expect(toPortableLibraryPath(root, join(root, 'Cafe\u0301.flac'))).toBe('Café.flac')
    expect(toPortableLibraryPath(root, join('other', 'Song.flac'))).toBeNull()
  })

  it('normalizes stored ref paths and casefold keys', () => {
    expect(normalizeRefPath('Album\\Sub\\Cafe\u0301.flac')).toBe('Album/Sub/Café.flac')
    expect(refPathKey('Album\\Song.FLAC')).toBe(refPathKey('album/song.flac'))
  })

  it('rejects unsafe ref paths', () => {
    expect(isSafeRefPath('Album/Song.flac')).toBe(true)
    expect(isSafeRefPath('../Song.flac')).toBe(false)
    expect(isSafeRefPath('/etc/passwd')).toBe(false)
    expect(isSafeRefPath('C:\\Music\\Song.flac')).toBe(false)
  })
})

describe('track refs', () => {
  it('normalizes path case for the portable ref and fingerprint', () => {
    const ref = refFor('Album/Song.flac')
    expect(ref.path).toBe('Album/Song.flac')
    expect(fingerprintKey(ref.fp)).toContain('song')
  })

  it('finds an exact path match case-insensitively', () => {
    const source = { track: track('a'.repeat(40)), filePath: join(root, 'Album', 'Song.flac') }
    const index = buildRefIndex([source], root)
    const result = resolveTrackRef(refFor('album/SONG.flac'), index)
    expect(result.status).toBe('found')
    expect(result.track?.id).toBe(source.track.id)
  })

  it('relinks a moved track by a unique fingerprint and returns a healed ref', () => {
    const index = buildRefIndex(
      [{ track: track('a'.repeat(40)), filePath: join(root, 'New', 'Song.flac') }],
      root
    )
    const result = resolveTrackRef(refFor('Old/Song.flac'), index)
    expect(result.status).toBe('relinked')
    expect(result.healedRef?.path).toBe('New/Song.flac')
  })

  it('accepts duration within one second but not beyond it', () => {
    const index = buildRefIndex(
      [
        {
          track: track('a'.repeat(40), { duration: 10.9 }),
          filePath: join(root, 'New', 'Song.flac')
        }
      ],
      root
    )
    expect(resolveTrackRef(refFor('Old/Song.flac'), index).status).toBe('relinked')

    const far = buildRefIndex(
      [
        {
          track: track('a'.repeat(40), { duration: 11.1 }),
          filePath: join(root, 'New', 'Song.flac')
        }
      ],
      root
    )
    expect(resolveTrackRef(refFor('Old/Song.flac'), far).status).toBe('missing')
  })

  it('treats zero or ambiguous fingerprint matches as missing', () => {
    const empty = buildRefIndex([], root)
    expect(resolveTrackRef(refFor('Old/Song.flac'), empty).status).toBe('missing')

    const ambiguous = buildRefIndex(
      [
        { track: track('a'.repeat(40)), filePath: join(root, 'A', 'Song.flac') },
        { track: track('b'.repeat(40)), filePath: join(root, 'B', 'Song.flac') }
      ],
      root
    )
    expect(resolveTrackRef(refFor('Old/Song.flac'), ambiguous).status).toBe('missing')
  })

  it('keeps the last duplicate path entry in the index', () => {
    const first = track('a'.repeat(40))
    const second = track('b'.repeat(40), { title: 'Other' })
    const index = buildRefIndex(
      [
        { track: first, filePath: join(root, 'Song.flac') },
        { track: second, filePath: join(root, 'Song.flac') }
      ],
      root
    )
    expect(resolveTrackRef(refFor('Song.flac'), index).track?.id).toBe(second.id)
  })
})

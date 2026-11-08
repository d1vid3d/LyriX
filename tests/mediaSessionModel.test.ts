import { describe, expect, it } from 'vitest'
import type { Track } from '../src/shared/types'
import {
  buildMediaMetadata,
  mapMediaAction,
  MEDIA_SEEK_STEP_SECONDS
} from '../src/renderer/media/mediaSessionModel'

const track: Track = {
  id: 'a'.repeat(40),
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album Artist',
  trackNumber: 1,
  discNumber: null,
  year: 2024,
  duration: 200,
  url: `media://track/${'a'.repeat(40)}`
}

describe('buildMediaMetadata', () => {
  it('uses the existing cover sizes for artwork', () => {
    expect(buildMediaMetadata(track, 'media://cover/album-1')).toEqual({
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      artwork: [
        { src: 'media://cover/album-1' },
        { src: 'media://cover/album-1?size=small' }
      ]
    })
  })

  it('omits artwork when the album has no cover', () => {
    expect(buildMediaMetadata(track, null).artwork).toEqual([])
  })
})

describe('mapMediaAction', () => {
  it('maps playback and track actions', () => {
    expect(mapMediaAction('play')).toEqual({ command: 'play' })
    expect(mapMediaAction('pause')).toEqual({ command: 'pause' })
    expect(mapMediaAction('previoustrack')).toEqual({ command: 'previous' })
    expect(mapMediaAction('nexttrack')).toEqual({ command: 'next' })
    expect(mapMediaAction('stop')).toEqual({ command: 'stop' })
  })

  it('uses the supplied seek offsets and the default step', () => {
    expect(mapMediaAction('seekbackward', { seekOffset: -3 })).toEqual({
      command: 'seekBackward',
      seconds: 3
    })
    expect(mapMediaAction('seekforward', { seekOffset: 7 })).toEqual({
      command: 'seekForward',
      seconds: 7
    })
    expect(mapMediaAction('seekbackward')).toEqual({
      command: 'seekBackward',
      seconds: MEDIA_SEEK_STEP_SECONDS
    })
  })

  it('maps seekto and rejects invalid or unknown actions', () => {
    expect(mapMediaAction('seekto', { seekTime: 12.5 })).toEqual({
      command: 'seekTo',
      seconds: 12.5
    })
    expect(mapMediaAction('seekto', { seekTime: -4 })).toEqual({
      command: 'seekTo',
      seconds: 0
    })
    expect(mapMediaAction('seekto')).toBeNull()
    expect(mapMediaAction('seekto', { seekTime: Number.NaN })).toBeNull()
    expect(mapMediaAction('unknown')).toBeNull()
  })
})
